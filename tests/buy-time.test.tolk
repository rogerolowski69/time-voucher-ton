import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/errors"
import "@contracts/messages"
import "@wrappers/JettonMinter.gen"
import "@wrappers/JettonWallet.gen"
import "@wrappers/utils"

import "test-utils"

get fun `test buy-time: payer should receive one time token`() {
    val (minter, deployer, buyer) = setupTest();
    val supplyBefore = minter.getTotalSupply();
    val buyerWallet = userWallet(minter, buyer.address);

    val buyResult = minter.buyTimeWithPayment(buyer.address, TEST_MINT_PRICE, TEST_BUY_TIME_GAS_BUFFER);
    expect(buyResult).toHaveSuccessfulTx<BuyTime>({
        from: buyer.address,
        to: minter.address,
    });
    expect(buyResult).toHaveSuccessfulTx<InternalTransferStep>({
        from: minter.address,
        to: buyerWallet.address,
    });

    expect(buyerWallet.getJettonBalance()).toEqual(TEST_TOKENS_PER_MINT);
    expect(minter.getTotalSupply()).toEqual(supplyBefore + TEST_TOKENS_PER_MINT);
}

get fun `test buy-time: underpayment should fail`() {
    val (minter, _, buyer) = setupTest();
    val supplyBefore = minter.getTotalSupply();
    val buyerWallet = userWallet(minter, buyer.address);

    val buyResult = minter.buyTimeWithPayment(buyer.address, TEST_MINT_PRICE / 2, ton("0.3"));
    expect(buyResult).toHaveFailedTx<BuyTime>({
        from: buyer.address,
        to: minter.address,
        exitCode: Errors.InsufficientPayment,
    });

    expect(buyerWallet.getJettonBalance()).toEqual(0);
    expect(minter.getTotalSupply()).toEqual(supplyBefore);
}
