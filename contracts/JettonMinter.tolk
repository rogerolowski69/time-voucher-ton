// =============================================================================
// JettonMinter.tolk — TIME voucher jetton master / pay-to-mint minter
// =============================================================================
//
// Purpose:
//   Master contract for TIME jettons: tracks total supply, metadata, admin;
//   mints on admin request or user BuyTime payment; handles burns and TEP-89 discovery.
//
// TEP standards:
//   TEP-74 — mint, burn_notification, admin ops, upgrade, get_jetton_data.
//   TEP-89 — RequestWalletAddress, get_wallet_address, on-chain metadata.
//
// Dependencies:
//   @gen/JettonWallet.code — compiled wallet code for deploy and address calc.
//   errors.tolk            — auth, payment, workchain, wallet validation.
//   fees-management.tolk   — transfer overhead for mint and BuyTime paths.
//   jetton-utils.tolk      — wallet deploy descriptor and address derivation.
//   messages.tolk          — typed message bodies and opcodes.
//   sharding.tolk          — MY_WORKCHAIN guards on mint and BuyTime.
//   storage.tolk           — MinterStorage, JettonDataReply, metadata types.
//
// TIME voucher context:
//   Users send BuyTime (0x8f4e2b17) with mintPrice + fees to receive tokensPerMint
//   TIME jettons. Admin sets mintPrice, withdraws revenue, and can free-mint via MintNewJettons.
//
// =============================================================================

import "@gen/JettonWallet.code"
import "errors"
import "fees-management"
import "jetton-utils"
import "messages"
import "sharding"
import "storage"

contract JettonMinter {
    author: "Acton User"
    version: "1.0.0"
    description: "Pay-to-mint Jetton time vouchers. TEP-74 and TEP-89 compliant"
    storage: MinterStorage
    incomingMessages: AllowedMessageToMinter
}

// -----------------------------------------------------------------------------
// Incoming message union (parsed from in.body)
// -----------------------------------------------------------------------------

type AllowedMessageToMinter =
    | MintNewJettons
    | BuyTime
    | SetMintPrice
    | WithdrawTon
    | BurnNotificationForMinter
    | RequestWalletAddress
    | ChangeMinterAdmin
    | ClaimMinterAdmin
    | DropMinterAdmin
    | ChangeMinterMetadata
    | UpgradeMinterCode
    | TopUpTons

// -----------------------------------------------------------------------------
// Bounce handler — roll back totalSupply when mint deploy bounces
// -----------------------------------------------------------------------------

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy InternalTransferStep.fromSlice(in.bouncedBody);

    var storage = lazy MinterStorage.load();
    storage.totalSupply -= msg.jettonAmount;
    storage.save();
}

// -----------------------------------------------------------------------------
// Admin authorization helper
// -----------------------------------------------------------------------------

fun assertSenderIsAdmin(senderAddress: address, adminAddress: address?) {
    assert (senderAddress == adminAddress!) throw Errors.NotOwner;
}

// -----------------------------------------------------------------------------
// Mint pipeline — deploy wallet and deliver InternalTransferStep
// -----------------------------------------------------------------------------

fun mintJettonsTo(
    mintRecipient: address,
    tonAmount: coins,
    internalTransferMsgCell: Cell<InternalTransferStep>,
    originalForwardFee: coins,
) {
    var storage = lazy MinterStorage.load();
    assert (mintRecipient.getWorkchain() == MY_WORKCHAIN) throw Errors.WrongWorkchain;

    val internalTransferMsg = lazy internalTransferMsgCell
        .load({ throwIfOpcodeDoesNotMatch: Errors.InvalidOp });
    val forwardTonAmount = internalTransferMsg.forwardTonAmount;
    internalTransferMsg.forwardPayload.checkIsCorrectTlbEither();

    checkAmountIsEnoughToTransfer(tonAmount, forwardTonAmount, originalForwardFee);

    storage.totalSupply += internalTransferMsg.jettonAmount;
    storage.save();

    reserveToncoinsOnBalance(
        ton("0.01"),
        RESERVE_MODE_EXACT_AMOUNT,
    );

    val jettonWalletCode = jettonWalletCompiledCode();
    val deployMsg = createMessage({
        bounce: BounceMode.Only256BitsOfBody,
        dest: calcDeployedJettonWallet(
            mintRecipient,
            contract.getAddress(),
            jettonWalletCode,
        ),
        value: tonAmount,
        body: internalTransferMsgCell,
    });
    deployMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_BOUNCE_ON_ACTION_FAIL);
}

// -----------------------------------------------------------------------------
// Internal message router
// -----------------------------------------------------------------------------

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);

    match (msg) {
        // ---------------------------------------------------------------------
        // Handler: burn_notification (0x7bdd97de) — wallet reports destroyed supply
        // ---------------------------------------------------------------------
        BurnNotificationForMinter => {
            var storage = lazy MinterStorage.load();
            val jettonWalletCode = jettonWalletCompiledCode();
            assert (
                in.senderAddress ==
                calcAddressOfJettonWallet(
                    msg.burnInitiator,
                    contract.getAddress(),
                    jettonWalletCode,
                )
            ) throw Errors.NotValidWallet;
            storage.totalSupply -= msg.jettonAmount;
            storage.save();

            if (msg.sendExcessesTo == null) {
                return;
            }

            val excessesMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.sendExcessesTo,
                value: 0,
                body: ReturnExcessesBack { queryId: msg.queryId },
            });
            excessesMsg.send(SEND_MODE_IGNORE_ERRORS | SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE);
        }

        // ---------------------------------------------------------------------
        // Handler: provide_wallet_address (0x2c76b973) — TEP-89 wallet discovery
        // ---------------------------------------------------------------------
        RequestWalletAddress => {
            val ownerAddress: Cell<address>? = msg.includeOwnerAddress
                ? msg.ownerAddress.toCell()
                : null;

            var walletAddress: address? = null;
            if (msg.ownerAddress.getWorkchain() == MY_WORKCHAIN) {
                val jettonWalletCode = jettonWalletCompiledCode();
                walletAddress = calcAddressOfJettonWallet(
                    msg.ownerAddress,
                    contract.getAddress(),
                    jettonWalletCode,
                );
            }

            val respondMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: in.senderAddress,
                value: 0,
                body: ResponseWalletAddress {
                    queryId: msg.queryId,
                    jettonWalletAddress: walletAddress,
                    ownerAddress,
                },
            });
            respondMsg.send(
                SEND_MODE_CARRY_ALL_REMAINING_MESSAGE_VALUE | SEND_MODE_BOUNCE_ON_ACTION_FAIL,
            );
        }

        // ---------------------------------------------------------------------
        // Handler: mint (0x642b7d07) — admin free-mint to arbitrary recipient
        // ---------------------------------------------------------------------
        MintNewJettons => {
            val storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            mintJettonsTo(
                msg.mintRecipient,
                msg.tonAmount,
                msg.internalTransferMsg,
                in.originalForwardFee,
            );
        }

        // ---------------------------------------------------------------------
        // Handler: buy_time (0x8f4e2b17) — pay mintPrice; receive tokensPerMint TIME
        // ---------------------------------------------------------------------
        BuyTime => {
            val storage = lazy MinterStorage.load();
            assert (in.senderAddress.getWorkchain() == MY_WORKCHAIN) throw Errors.WrongWorkchain;
            assert (storage.mintPrice > 0) throw Errors.InsufficientPayment;
            assert (storage.tokensPerMint > 0) throw Errors.InsufficientPayment;

            val forwardTonAmount = 0;
            val minTransferTon = calcMinimalTransferAmount(forwardTonAmount, in.originalForwardFee) + 1;
            assert (in.valueCoins >= storage.mintPrice + minTransferTon) throw Errors.InsufficientPayment;

            val forwardPayload = beginCell().storeUint(0, 1).endCell().beginParse();
            mintJettonsTo(
                in.senderAddress,
                minTransferTon,
                InternalTransferStep {
                    queryId: msg.queryId,
                    jettonAmount: storage.tokensPerMint,
                    transferInitiator: null,
                    sendExcessesTo: in.senderAddress,
                    forwardTonAmount,
                    forwardPayload,
                }.toCell(),
                in.originalForwardFee,
            );
        }

        // ---------------------------------------------------------------------
        // Admin: set_mint_price (0x91c2a4e8) — configure BuyTime payment amount
        // ---------------------------------------------------------------------
        SetMintPrice => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            assert (msg.mintPrice > 0) throw Errors.InsufficientPayment;
            storage.mintPrice = msg.mintPrice;
            storage.save();
        }

        // ---------------------------------------------------------------------
        // Admin: withdraw_ton (0xa1d4e7f2) — send accumulated mint revenue out
        // ---------------------------------------------------------------------
        WithdrawTon => {
            val storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);

            reserveToncoinsOnBalance(
                ton("0.01"),
                RESERVE_MODE_AT_MOST,
            );

            val outMsg = createMessage({
                bounce: BounceMode.NoBounce,
                dest: msg.destination,
                value: msg.amount,
            });

            if (msg.amount > 0) {
                outMsg.send(SEND_MODE_PAY_FEES_SEPARATELY | SEND_MODE_IGNORE_ERRORS);
            } else {
                outMsg.send(SEND_MODE_CARRY_ALL_BALANCE | SEND_MODE_IGNORE_ERRORS);
            }
        }

        // ---------------------------------------------------------------------
        // Admin: change_admin (0x6501f354) — nominate next admin
        // ---------------------------------------------------------------------
        ChangeMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.nextAdminAddress = msg.newAdminAddress;
            storage.save();
        }

        // ---------------------------------------------------------------------
        // Admin: claim_admin (0xfb88e119) — accept nominated admin role
        // ---------------------------------------------------------------------
        ClaimMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.nextAdminAddress);
            storage.adminAddress = storage.nextAdminAddress;
            storage.nextAdminAddress = null;
            storage.save();
        }

        // ---------------------------------------------------------------------
        // Admin: drop_admin (0x7431f221) — renounce admin (non-mintable)
        // ---------------------------------------------------------------------
        DropMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.adminAddress = null;
            storage.nextAdminAddress = null;
            storage.save();
        }

        // ---------------------------------------------------------------------
        // Admin: change_metadata (0xcb862902) — update on-chain jetton content
        // ---------------------------------------------------------------------
        ChangeMinterMetadata => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.metadata = msg.newMetadata;
            storage.save();
        }

        // ---------------------------------------------------------------------
        // Admin: upgrade (0x2508d66a) — replace minter code and data
        // ---------------------------------------------------------------------
        UpgradeMinterCode => {
            val storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            contract.setCodePostponed(msg.newCode);
            contract.setData(msg.newData);
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

get fun get_jetton_data(): JettonDataReply {
    val storage = lazy MinterStorage.load();
    val jettonWalletCode = jettonWalletCompiledCode();

    return {
        totalSupply: storage.totalSupply,
        mintable: storage.adminAddress != null,
        adminAddress: storage.adminAddress,
        jettonContent: storage.metadata as Cell<OnchainMetadataReply>,
        jettonWalletCode,
    };
}

get fun get_wallet_address(ownerAddress: address): address {
    val jettonWalletCode = jettonWalletCompiledCode();
    return calcAddressOfJettonWallet(ownerAddress, contract.getAddress(), jettonWalletCode);
}

get fun get_next_admin_address(): address? {
    val storage = lazy MinterStorage.load();
    return storage.nextAdminAddress;
}

// -----------------------------------------------------------------------------
// Getters — TIME voucher economics
// -----------------------------------------------------------------------------

get fun get_mint_price(): int {
    val storage = lazy MinterStorage.load();
    return storage.mintPrice;
}

get fun get_tokens_per_mint(): int {
    val storage = lazy MinterStorage.load();
    return storage.tokensPerMint;
}
