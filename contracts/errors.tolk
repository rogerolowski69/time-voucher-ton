// =============================================================================
// errors.tolk — Shared exit codes for TIME voucher jetton contracts
// =============================================================================
//
// Purpose:
//   Central registry of contract exit codes thrown via `throw Errors.*`.
//   Keeps JettonWallet and JettonMinter aligned on failure semantics.
//
// TEP standards:
//   TEP-74 (Jetton standard) — balance, ownership, and wallet validation errors.
//   TEP-89 (Discoverable Jettons) — no dedicated codes; shares wallet/minter errors.
//
// Dependencies:
//   None. Imported by fees-management.tolk, JettonWallet.tolk, JettonMinter.tolk.
//
// TIME voucher context:
//   BuyTime and pay-to-mint flows reuse InsufficientPayment and NotEnoughGas
//   when attached TON is below mintPrice plus deployment/transfer overhead.
//
// =============================================================================

enum Errors {
    BalanceError = 47
    NotEnoughGas = 48
    InvalidMessage = 49
    InvalidOp = 72
    NotOwner = 73
    NotValidWallet = 74
    InsufficientPayment = 75
    WrongWorkchain = 333
}
