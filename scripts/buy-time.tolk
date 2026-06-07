import "@acton/io"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@wrappers/utils"
import "utils/common"

fun main() {
    val buyer = promptJettonWallet("TIME_BUYER", "Select buyer wallet");
    val minter = promptJettonMinter("Enter Time Voucher minter address");
    val mintPrice = minter.getMintPrice();

    println("Mint price: {:ton}", mintPrice);
    println("Tokens per purchase: {}", minter.getTokensPerMint());

    val res = minter.buyTimeWithPayment(buyer.address, mintPrice, ton("0.3"));
    println(res.waitForTrace());

    printJettonMinterInfo(minter, "TIME");
    printJettonWalletInfo(minter, buyer.address, "TIME_BUYER");
}
