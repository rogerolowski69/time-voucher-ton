import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/utils"
import "utils/common"

fun main() {
    val admin = promptJettonWallet("TIME_ADMIN", "Select admin wallet");
    val minter = promptJettonMinter("Enter Time Voucher minter address");
    val destination = promptJettonAddress(
        "TIME_WITHDRAW_DESTINATION",
        "Enter withdrawal destination",
        admin.address,
    );
    val amount = promptJettonCoins(
        "TIME_WITHDRAW_AMOUNT",
        "Enter amount in nanotons (0 = withdraw all)",
        "0",
    );

    val res = minter.sendWithdrawTon(admin.address, 0, amount, destination, { value: ton("0.05") });
    println(res.waitForTrace());

    printJettonMinterInfo(minter, "TIME");
}
