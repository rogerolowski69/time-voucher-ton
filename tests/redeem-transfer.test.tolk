import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/messages"
import "@wrappers/JettonMinter.gen"
import "@wrappers/JettonWallet.gen"
import "@wrappers/utils"

import "test-utils"

get fun `test redeem: buyer can transfer TIME to issuer wallet`() {
    val (minter, deployer, buyer) = setupTest();
    val issuer = testing.treasury("issuer");

    val buyResult = minter.buyTimeWithPayment(buyer.address, TEST_MINT_PRICE, TEST_BUY_TIME_GAS_BUFFER);
    expect(buyResult).toHaveSuccessfulTx<BuyTime>({
        from: buyer.address,
        to: minter.address,
    });

    val buyerWallet = userWallet(minter, buyer.address);
    expect(buyerWallet.getJettonBalance()).toEqual(TEST_TOKENS_PER_MINT);

    val transferResult = buyerWallet.sendTransfer(
        buyer.address,
        DEFAULT_TRANSFER_MSG_VALUE,
        TEST_TOKENS_PER_MINT,
        issuer.address,
        buyer.address,
        null,
        0,
        null,
    );
    expect(transferResult).toHaveSuccessfulTx<AskToTransfer>({
        from: buyer.address,
        to: buyerWallet.address,
    });
    expect(transferResult).toHaveSuccessfulTx<InternalTransferStep>({
        from: buyerWallet.address,
    });

    val issuerWallet = userWallet(minter, issuer.address);
    expect(buyerWallet.getJettonBalance()).toEqual(0);
    expect(issuerWallet.getJettonBalance()).toEqual(TEST_TOKENS_PER_MINT);
}
