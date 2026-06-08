// Redeemable NFT item — on-chain storage and getter reply types (TEP-62 style POC)

struct NftItemStorage {
    initialized: bool
    index: uint64
    collectionAddress: address
    ownerAddress: address
    content: cell
    redeemed: bool
}

struct RedeemDataReply {
    ownerAddress: address
    redeemed: bool
}

fun NftItemStorage.load(): NftItemStorage {
    return NftItemStorage.fromCell(contract.getData());
}

fun NftItemStorage.save(self) {
    contract.setData(self.toCell());
}
