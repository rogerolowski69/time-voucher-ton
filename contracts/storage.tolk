// =============================================================================
// storage.tolk — On-chain state layouts and getter reply types
// =============================================================================
//
// Purpose:
//   Defines persistent storage for JettonWallet and JettonMinter, plus TEP getter
//   reply structs (wallet data, jetton data, on-chain metadata).
//
// TEP standards:
//   TEP-74 — WalletStorage, JettonWalletDataReply, JettonDataReply field layout.
//   TEP-89 — OnchainMetadataReply (opcode 0x00) for discoverable jetton metadata.
//
// Dependencies:
//   @stdlib/strings — string_prefixed0x in OnchainMetadataReply content dict.
//
// TIME voucher context:
//   MinterStorage extends the standard minter with mintPrice and tokensPerMint,
//   backing the pay-to-mint BuyTime flow (1 TON payment → fixed TIME token grant).
//
// =============================================================================

import "@stdlib/strings"

// -----------------------------------------------------------------------------
// Wallet persistent state (TEP-74 jetton wallet)
// -----------------------------------------------------------------------------

struct WalletStorage {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
}

// -----------------------------------------------------------------------------
// Minter persistent state (TEP-74 jetton master + TIME voucher economics)
// -----------------------------------------------------------------------------

struct MinterStorage {
    totalSupply: coins
    adminAddress: address?
    nextAdminAddress: address?
    metadata: cell
    mintPrice: coins
    tokensPerMint: coins
}

// -----------------------------------------------------------------------------
// Storage load/save helpers
// -----------------------------------------------------------------------------

fun MinterStorage.load(): MinterStorage {
    return MinterStorage.fromCell(contract.getData());
}

fun MinterStorage.save(self) {
    contract.setData(self.toCell());
}

fun WalletStorage.load(): WalletStorage {
    return WalletStorage.fromCell(contract.getData());
}

fun WalletStorage.save(self) {
    contract.setData(self.toCell());
}

// -----------------------------------------------------------------------------
// Getter reply types (TEP-74 / TEP-89)
// -----------------------------------------------------------------------------

struct JettonWalletDataReply {
    jettonBalance: coins
    ownerAddress: address
    minterAddress: address
    jettonWalletCode: cell
}

struct JettonDataReply {
    totalSupply: int
    mintable: bool
    adminAddress: address?
    jettonContent: Cell<OnchainMetadataReply>
    jettonWalletCode: cell
}

// TEP-89 on-chain metadata wrapper (opcode 0x00)
struct (0x00) OnchainMetadataReply {
    contentDict: map<uint256, string_prefixed0x>
}
