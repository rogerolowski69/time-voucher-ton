// =============================================================================
// sharding.tolk — Workchain and shard-placement constants
// =============================================================================
//
// Purpose:
//   Pins jetton wallet deployment to the base workchain and a fixed shard prefix
//   so wallets co-locate near their owner's address (lower forward fees).
//
// TEP standards:
//   TEP-74 — jetton wallets are deployed per-owner; shard hints are deployment-only.
//
// Dependencies:
//   None. Imported by jetton-utils.tolk, fees-management.tolk, JettonWallet.tolk,
//   JettonMinter.tolk.
//
// TIME voucher context:
//   BuyTime mints wallets for buyers on the same shard layout as standard transfers.
//
// =============================================================================

const MY_WORKCHAIN = BASECHAIN

const SHARD_DEPTH = 8
