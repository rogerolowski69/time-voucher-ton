import "@acton/emulation/network"
import "@acton/emulation/testing"
import "@acton/testing/expect"
import "@contracts/errors"
import "@contracts/messages"
import "@wrappers/JettonMinter.gen"
import "@wrappers/utils"

import "test-utils"

get fun `test withdraw: admin can withdraw tons after buy-time`() {
    val (minter, deployer, buyer) = setupTest();

    val buyResult = minter.buyTimeWithPayment(buyer.address, TEST_MINT_PRICE, TEST_BUY_TIME_GAS_BUFFER);
    expect(buyResult).toHaveSuccessfulTx<BuyTime>({
        from: buyer.address,
        to: minter.address,
    });

    val minterBefore = testing.getAccountState(minter.address);
    val adminBefore = testing.getAccountState(deployer.address);
    if (minterBefore == null || adminBefore == null) {
        return;
    }

    val withdrawResult = minter.sendWithdrawTon(
        deployer.address,
        0,
        ton("0.2"),
        deployer.address,
        { value: ton("0.05"), bounce: false },
    );
    expect(withdrawResult).toHaveSuccessfulTx<WithdrawTon>({
        from: deployer.address,
        to: minter.address,
    });

    val minterAfter = testing.getAccountState(minter.address);
    val adminAfter = testing.getAccountState(deployer.address);
    if (minterAfter == null || adminAfter == null) {
        return;
    }

    expect(minterAfter.storage.balance.grams < minterBefore.storage.balance.grams).toEqual(true);
    expect(adminAfter.storage.balance.grams > adminBefore.storage.balance.grams).toEqual(true);
}

get fun `test withdraw: non-admin cannot withdraw tons`() {
    val (minter, deployer, buyer) = setupTest();

    val withdrawResult = minter.sendWithdrawTon(
        buyer.address,
        0,
        ton("0.1"),
        buyer.address,
        { value: ton("0.05"), bounce: false },
    );
    expect(withdrawResult).toHaveFailedTx<WithdrawTon>({
        from: buyer.address,
        to: minter.address,
        exitCode: Errors.NotOwner,
    });
}
