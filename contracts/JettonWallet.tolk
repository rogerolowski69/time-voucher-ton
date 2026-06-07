// =============================================================================
// JettonWallet.tolk — Per-owner TIME voucher jetton wallet (TEP-74 / TEP-89)
// =============================================================================
//
// Purpose:
//   Holds a single owner's TIME jetton balance. Handles transfers, burns,
//   incoming internal_transfers (from mints/transfers), bounce recovery, and TON top-ups.
//
// TEP standards:
//   TEP-74 — transfer, internal_transfer, burn, excesses, transfer_notification.
//   TEP-89 — get_wallet_data getter for wallet discovery integrations.
//
// Dependencies:
//   @stdlib/gas-payments — reserveToncoinsOnBalance for excesses handling.
//   errors.tolk          — exit codes for auth, balance, gas, workchain checks.
//   fees-management.tolk — minimum TON checks for transfer and burn.
//   jetton-utils.tolk    — recipient wallet address / deploy descriptor.
//   messages.tolk        — typed message bodies and opcodes.
//   sharding.tolk        — MY_WORKCHAIN guard on outbound transfers.
//   storage.tolk         — WalletStorage and JettonWalletDataReply.
//
// TIME voucher context:
//   Wallets receive TIME tokens via InternalTransferStep from the minter (BuyTime,
//   admin mint) or from peer wallets. Standard TEP-74 transfer/burn semantics apply.
//
// =============================================================================

import "@stdlib/gas-payments"
import "errors"
import "fees-management"
import "jetton-utils"
import "messages"
import "sharding"
import "storage"

contract JettonWallet {
    author: "Acton User"
    version: "1.0.0"
    description: "Standard Jetton Wallet. TEP-74 and TEP-89 compliant"
    storage: WalletStorage
    incomingMessages: AllowedMessageToWallet
}

// -----------------------------------------------------------------------------
// Incoming message union (parsed from in.body)
// -----------------------------------------------------------------------------

type AllowedMessageToWallet =
    | AskToTransfer
    | AskToBurn
    | InternalTransferStep
    | TopUpTons

// -----------------------------------------------------------------------------
// Bounce handler — restore balance when outbound transfer/burn fails
// -----------------------------------------------------------------------------

fun onBouncedMessage(in: InMessageBounced) {
    val restoreAmount = loadJettonAmountFromTruncatedBounce(in.bouncedBody);

    var storage = lazy WalletStorage.load();
    storage.jettonBalance += restoreAmount;
    storage.save();
}

// -----------------------------------------------------------------------------
// Internal message router
// -----------------------------------------------------------------------------

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToWallet.fromSlice(in.body);

    match (msg) {
        // ---------------------------------------------------------------------
        // Handler: internal_transfer (0x178d4519) — receive jettons from minter or peer wallet
        // ---------------------------------------------------------------------
        InternalTransferStep => {
            var storage = lazy WalletStorage.load();
            if (in.senderAddress != storage.minterAddress) {
                assert (
                    in.senderAddress ==
                    calcAddressOfJettonWallet(
                        msg.transferInitiator!,
                        storage.minterAddress,
                        contract.getCode(),
                    )
                ) throw Errors.NotValidWallet;
            }
            storage.jettonBalance += msg.jettonAmount;
            storage.save();

            if (msg.forwardTonAmount != 0) {
                val notifyOwnerMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: storage.ownerAddress,
                    value: msg.forwardTonAmount,
                    body: TransferNotificationForRecipient {
                        queryId: msg.queryId,
                        jettonAmount: msg.jettonAmount,
                        transferInitiator: msg.transferInitiator,
                        forwardPayload: msg.forwardPayload,
                    },
                });
                notifyOwnerMsg.send(
                    SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
                );
            }

            if (msg.sendExcessesTo != null) {
                val toLeaveOnBalance = contract.getOriginalBalance() - in.valueCoins +
                contract.getStorageDuePayment();
                reserveToncoinsOnBalance(
                    max(toLeaveOnBalance, calculateJettonWalletMinStorageFee()),
                    RESERVE_MODE_AT_MOST,
                );

                val excessesMsg = createMessage({
                    bounce: BounceMode.NoBounce,
                    dest: msg.sendExcessesTo,
                    value: 0,
                    body: ReturnExcessesBack { queryId: msg.queryId },
                });
                // SAFETY: It is safe because of reserveToncoinsOnBalance() called earlier
                excessesMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            }
        }

        // ---------------------------------------------------------------------
        // Handler: transfer (0x0f8a7ea5) — owner sends jettons to another wallet
        // ---------------------------------------------------------------------
        AskToTransfer => {
            msg.forwardPayload.checkIsCorrectTlbEither();
            assert (
                msg.transferRecipient.getWorkchain() == MY_WORKCHAIN
            ) throw Errors.WrongWorkchain;
            checkAmountIsEnoughToTransfer(
                in.valueCoins,
                msg.forwardTonAmount,
                in.originalForwardFee,
            );

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (storage.jettonBalance >= msg.jettonAmount) throw Errors.BalanceError;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val deployMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: calcDeployedJettonWallet(
                    msg.transferRecipient,
                    storage.minterAddress,
                    contract.getCode(),
                ),
                value: 0,
                body: InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    transferInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                    forwardTonAmount: msg.forwardTonAmount,
                    forwardPayload: msg.forwardPayload,
                },
            });
            deployMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        // ---------------------------------------------------------------------
        // Handler: burn (0x595f07bc) — owner destroys jettons; notifies minter
        // ---------------------------------------------------------------------
        AskToBurn => {
            checkAmountIsEnoughToBurn(in.valueCoins);

            var storage = lazy WalletStorage.load();
            assert (in.senderAddress == storage.ownerAddress) throw Errors.NotOwner;
            assert (storage.jettonBalance >= msg.jettonAmount) throw Errors.BalanceError;
            storage.jettonBalance -= msg.jettonAmount;
            storage.save();

            val notifyMinterMsg = createMessage({
                bounce: BounceMode.Only256BitsOfBody,
                dest: storage.minterAddress,
                value: 0,
                body: BurnNotificationForMinter {
                    queryId: msg.queryId,
                    jettonAmount: msg.jettonAmount,
                    burnInitiator: storage.ownerAddress,
                    sendExcessesTo: msg.sendExcessesTo,
                },
            });
            notifyMinterMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        // ---------------------------------------------------------------------
        // Handler: top-up (0xd372158c) — accept plain TON without state change
        // ---------------------------------------------------------------------
        TopUpTons => {
            // just accept tons
        }

        else => throw 0xFFFF,
    }
}

// -----------------------------------------------------------------------------
// Getters (TEP-74 / TEP-89)
// -----------------------------------------------------------------------------

get fun get_wallet_data(): JettonWalletDataReply {
    val storage = lazy WalletStorage.load();

    return {
        jettonBalance: storage.jettonBalance,
        ownerAddress: storage.ownerAddress,
        minterAddress: storage.minterAddress,
        jettonWalletCode: contract.getCode(),
    };
}
