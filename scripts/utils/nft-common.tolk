import "@stdlib/strings"
import "@acton/env"
import "@acton/io"
import "@acton/prompts"
import "@acton/emulation/network"
import "@acton/emulation/scripts"
import "@contracts/nft-storage"
import "@wrappers/RedeemableNftItem.gen"
import "@wrappers/nft-utils"

const NFT_DEFAULT_INDEX = "1"
const NFT_DEFAULT_CONTENT_URI = "ipfs://time-voucher/item-0001.json"

fun promptNftString(envName: string, message: string, default: string): string {
    return env<string>(envName) ?? prompt(message, "", default);
}

fun promptNftAddress(envName: string, message: string, default: address? = null): address {
    return env<address>(envName) ?? promptAddress(message, default);
}

fun promptNftWallet(envName: string, message: string): ActonWallet {
    return scripts.wallet(env<string>(envName) ?? promptWallet(message));
}

fun promptNftItemStorage(owner: address): NftItemStorage {
    val collection = promptNftAddress(
        "NFT_COLLECTION_ADDRESS",
        "Enter collection address (POC: use owner or deployer)",
        owner,
    );
    val index = (env<int>("NFT_INDEX") ?? promptInt("Enter NFT index", NFT_DEFAULT_INDEX)) as uint64;
    val _contentUri = promptNftString("NFT_CONTENT_URI", "Enter NFT content URI", NFT_DEFAULT_CONTENT_URI);

    return {
        initialized: true,
        index,
        collectionAddress: collection,
        ownerAddress: owner,
        content: beginCell().endCell(),
        redeemed: false,
    };
}

fun deployRedeemableNftItem(deployer: ActonWallet, storage: NftItemStorage): RedeemableNftItem {
    val item = RedeemableNftItem.fromStorage(storage);
    val res = item.sendDeploy(deployer.address, { value: ton("0.05") });
    res.waitForFirstTransaction();
    return item;
}

fun printNftItemInfo(item: RedeemableNftItem, label: string) {
    val data = item.getRedeemData();
    val nftData = item.getNftData();
    println("{} NFT_ITEM_ADDRESS={}", label, item.address);
    println("{} OWNER_ADDRESS={}", label, data.ownerAddress);
    println("{} REDEEMED={}", label, data.redeemed);
    println("{} INDEX={}", label, nftData.1);
    println("{} COLLECTION_ADDRESS={}", label, nftData.2);
}
