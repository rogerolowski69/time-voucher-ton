import "@acton/env"
import "@acton/prompts"
import "@wrappers/RedeemableNftItem.gen"
import "utils/nft-common"

fun main() {
    val addr = env<address>("NFT_ITEM_ADDRESS") ?? promptAddress("Enter RedeemableNftItem address");
    val item = RedeemableNftItem.fromAddress(addr);
    printNftItemInfo(item, "NFT");
}
