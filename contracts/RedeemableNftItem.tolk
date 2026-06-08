// Redeemable NFT item — owner calls RedeemNft to flip redeemed=true (unlocks booking link)

import "errors"
import "messages"
import "nft-messages"
import "nft-storage"

contract RedeemableNftItem {
    author: "Acton User"
    version: "1.0.0"
    description: "Single redeemable NFT item with get_redeem_data getter"
    storage: NftItemStorage
    incomingMessages: AllowedMessageToNftItem
}

type AllowedMessageToNftItem = RedeemNft | TopUpTons

get fun get_redeem_data(): RedeemDataReply {
    val storage = lazy NftItemStorage.load();
    assert (storage.initialized) throw Errors.InvalidMessage;
    return {
        ownerAddress: storage.ownerAddress,
        redeemed: storage.redeemed,
    };
}

get fun get_nft_data(): (int, int, address, address, cell) {
    val storage = lazy NftItemStorage.load();
    assert (storage.initialized) throw Errors.InvalidMessage;
    return (
        -1,
        storage.index,
        storage.collectionAddress,
        storage.ownerAddress,
        storage.content,
    );
}

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToNftItem.fromSlice(in.body);
    match (msg) {
        RedeemNft => {
            var storage = lazy NftItemStorage.load();
            assert (storage.initialized) throw Errors.InvalidMessage;
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (!storage.redeemed) throw Errors.InvalidMessage;
            storage.redeemed = true;
            storage.save();
        }
        TopUpTons => {
            return;
        }
        else => {
            assert (false) throw Errors.InvalidOp;
        }
    }
}
