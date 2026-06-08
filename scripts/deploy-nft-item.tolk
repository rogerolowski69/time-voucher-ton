import "@acton/io"
import "@acton/emulation/scripts"
import "utils/nft-common"

fun main() {
    val deployer = promptNftWallet("NFT_DEPLOYER", "Select NFT deployer wallet");
    val owner = promptNftAddress(
        "NFT_OWNER_ADDRESS",
        "Enter NFT owner address (voucher holder)",
        deployer.address,
    );
    val storage = promptNftItemStorage(owner);

    val item = deployRedeemableNftItem(deployer, storage);

    printNftItemInfo(item, "NFT");
    println("");
    println("Copy NFT_ITEM_ADDRESS into:");
    println("  web/.env          → PUBLIC_NFT_ITEM_ADDRESS");
    println("  Railway Variables → PUBLIC_NFT_ITEM_ADDRESS");
    println("Then redeploy Railway for Version A/B redeem gating.");
}
