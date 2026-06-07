// =============================================================================
// messages.tolk — TLB message structs and opcodes for TIME voucher jettons
// =============================================================================
//
// Purpose:
//   Typed internal-message bodies for JettonWallet and JettonMinter handlers.
//   Opcodes match TEP-74/TEP-89; TIME-specific ops extend the minter surface.
//
// TEP standards:
//   TEP-74 — transfer, burn, internal_transfer, excesses, mint, admin, upgrade.
//   TEP-89 — RequestWalletAddress / ResponseWalletAddress for wallet discovery.
//
// Dependencies:
//   None. Imported by jetton-utils.tolk (indirect), JettonWallet.tolk, JettonMinter.tolk.
//
// TIME voucher context:
//   BuyTime (0x8f4e2b17) — user pays mintPrice TON to receive tokensPerMint TIME.
//   SetMintPrice (0x91c2a4e8) — admin adjusts the pay-to-mint price.
//   WithdrawTon (0xa1d4e7f2) — admin withdraws accumulated mint revenue.
//
// =============================================================================

// -----------------------------------------------------------------------------
// Forward payload encoding (TEP-74 either: inline bits or ref)
// -----------------------------------------------------------------------------

type ForwardPayloadRemainder = RemainingBitsAndRefs

struct (0b0) PayloadInline {
    value: RemainingBitsAndRefs
}

struct (0b1) PayloadInRef {
    value: Cell<RemainingBitsAndRefs>
}

// -----------------------------------------------------------------------------
// TEP-74 wallet → wallet / wallet → owner messages
// -----------------------------------------------------------------------------

// Opcode 0x0f8a7ea5 — owner-initiated jetton transfer (TEP-74 transfer)
struct (0x0f8a7ea5) AskToTransfer {
    queryId: uint64
    jettonAmount: coins
    transferRecipient: address
    sendExcessesTo: address?
    customPayload: cell?
    forwardTonAmount: coins
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

// Opcode 0x7362d09c — notify recipient owner of incoming jettons (TEP-74 transfer_notification)
struct (0x7362d09c) TransferNotificationForRecipient {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

// Opcode 0x178d4519 — inter-wallet jetton delivery step (TEP-74 internal_transfer)
struct (0x178d4519) InternalTransferStep {
    queryId: uint64
    jettonAmount: coins
    transferInitiator: address?
    sendExcessesTo: address?
    forwardTonAmount: coins
    @abi.clientType(PayloadInline | PayloadInRef)
    forwardPayload: ForwardPayloadRemainder
}

// Opcode 0xd53276db — return surplus TON to sender (TEP-74 excesses)
struct (0xd53276db) ReturnExcessesBack {
    queryId: uint64
}

// Opcode 0x595f07bc — owner-initiated burn request (TEP-74 burn)
struct (0x595f07bc) AskToBurn {
    queryId: uint64
    jettonAmount: coins
    sendExcessesTo: address?
    customPayload: cell?
}

// Opcode 0x7bdd97de — wallet → minter burn confirmation (TEP-74 burn_notification)
struct (0x7bdd97de) BurnNotificationForMinter {
    queryId: uint64
    jettonAmount: coins
    burnInitiator: address
    sendExcessesTo: address?
}

// -----------------------------------------------------------------------------
// TEP-89 discoverable jettons — wallet address lookup
// -----------------------------------------------------------------------------

// Opcode 0x2c76b973 — query jetton wallet address for an owner (TEP-89)
struct (0x2c76b973) RequestWalletAddress {
    queryId: uint64
    ownerAddress: address
    includeOwnerAddress: bool
}

// Opcode 0xd1735400 — reply with computed wallet address (TEP-89)
struct (0xd1735400) ResponseWalletAddress {
    queryId: uint64
    jettonWalletAddress: address?
    ownerAddress: Cell<address>?
}

// -----------------------------------------------------------------------------
// TEP-74 minter messages — mint and admin
// -----------------------------------------------------------------------------

// Opcode 0x642b7d07 — admin mint to recipient via internal_transfer (TEP-74 mint)
struct (0x642b7d07) MintNewJettons {
    queryId: uint64
    mintRecipient: address
    tonAmount: coins
    internalTransferMsg: Cell<InternalTransferStep>
}

// Opcode 0x6501f354 — propose next admin (TEP-74 change_admin)
struct (0x6501f354) ChangeMinterAdmin {
    queryId: uint64
    newAdminAddress: address
}

// Opcode 0xfb88e119 — accept proposed admin role (TEP-74 claim_admin)
struct (0xfb88e119) ClaimMinterAdmin {
    queryId: uint64
}

// Opcode 0x7431f221 — renounce admin (TEP-74 drop_admin)
struct (0x7431f221) DropMinterAdmin {
    queryId: uint64
}

// Opcode 0x2508d66a — upgrade minter code and data (TEP-74 upgrade)
struct (0x2508d66a) UpgradeMinterCode {
    queryId: uint64
    newData: cell
    newCode: cell
}

// Opcode 0xcb862902 — replace on-chain metadata cell (TEP-74 change_metadata)
struct (0xcb862902) ChangeMinterMetadata {
    queryId: uint64
    newMetadata: cell
}

// Opcode 0xd372158c — accept plain TON top-up (no body fields)
struct (0xd372158c) TopUpTons {}

// -----------------------------------------------------------------------------
// TIME voucher extensions — pay-to-mint and treasury
// -----------------------------------------------------------------------------

// Opcode 0x8f4e2b17 — pay mintPrice TON; minter mints tokensPerMint to sender
struct (0x8f4e2b17) BuyTime {
    queryId: uint64
}

// Opcode 0x91c2a4e8 — admin sets mintPrice (minimum payment per BuyTime)
struct (0x91c2a4e8) SetMintPrice {
    queryId: uint64
    mintPrice: coins
}

// Opcode 0xa1d4e7f2 — admin withdraws TON from minter balance
struct (0xa1d4e7f2) WithdrawTon {
    queryId: uint64
    amount: coins
    destination: address
}

// -----------------------------------------------------------------------------
// Forward payload validation
// -----------------------------------------------------------------------------

fun ForwardPayloadRemainder.checkIsCorrectTlbEither(self) {
    var mutableCopy = self;
    if (mutableCopy.loadMaybeRef() != null) {
        mutableCopy.assertEnd();
    }
}
