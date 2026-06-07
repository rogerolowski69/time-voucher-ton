// =============================================================================
// jetton-utils.tolk — Jetton wallet address derivation and deployment hints
// =============================================================================
//
// Purpose:
//   Computes deterministic jetton wallet addresses and AutoDeployAddress state-init
//   payloads for wallet deployment (transfers, mints, BuyTime).
//
// TEP standards:
//   TEP-74 — wallet address = hash(minter, owner, wallet code, initial storage).
//   TEP-89 — same address formula used by get_wallet_address and discovery replies.
//
// Dependencies:
//   sharding.tolk — MY_WORKCHAIN, SHARD_DEPTH for shard-close deployment.
//   storage.tolk  — WalletStorage initial layout for empty wallet state-init.
//
// TIME voucher context:
//   BuyTime and MintNewJettons both deploy recipient wallets via calcDeployedJettonWallet.
//
// =============================================================================

import "sharding"
import "storage"

// -----------------------------------------------------------------------------
// Deployment descriptor (state-init + shard hint)
// -----------------------------------------------------------------------------

fun calcDeployedJettonWallet(
    ownerAddress: address,
    minterAddress: address,
    jettonWalletCode: cell,
): AutoDeployAddress {
    val emptyWalletStorage: WalletStorage = {
        jettonBalance: 0,
        ownerAddress,
        minterAddress,
    };

    return {
        workchain: MY_WORKCHAIN,
        stateInit: { code: jettonWalletCode, data: emptyWalletStorage.toCell() },
        toShard: { fixedPrefixLength: SHARD_DEPTH, closeTo: ownerAddress },
    };
}

// -----------------------------------------------------------------------------
// Resolved wallet address (no deployment)
// -----------------------------------------------------------------------------

fun calcAddressOfJettonWallet(
    ownerAddress: address,
    minterAddress: address,
    jettonWalletCode: cell,
): address {
    val jwDeployed = calcDeployedJettonWallet(ownerAddress, minterAddress, jettonWalletCode);
    return jwDeployed.calculateAddress();
}
