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

fun onBouncedMessage(in: InMessageBounced) {
    in.bouncedBody.skipBouncedPrefix();
    val msg = lazy InternalTransferStep.fromSlice(in.bouncedBody);

    var storage = lazy MinterStorage.load();
    storage.totalSupply -= msg.jettonAmount;
    storage.save();
}

fun assertSenderIsAdmin(senderAddress: address, adminAddress: address?) {
    assert (senderAddress == adminAddress!) throw Errors.NotOwner;
}

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

fun onInternalMessage(in: InMessage) {
    val msg = lazy AllowedMessageToMinter.fromSlice(in.body);

    match (msg) {
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

        SetMintPrice => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            assert (msg.mintPrice > 0) throw Errors.InsufficientPayment;
            storage.mintPrice = msg.mintPrice;
            storage.save();
        }

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

        ChangeMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.nextAdminAddress = msg.newAdminAddress;
            storage.save();
        }

        ClaimMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.nextAdminAddress);
            storage.adminAddress = storage.nextAdminAddress;
            storage.nextAdminAddress = null;
            storage.save();
        }

        DropMinterAdmin => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.adminAddress = null;
            storage.nextAdminAddress = null;
            storage.save();
        }

        ChangeMinterMetadata => {
            var storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            storage.metadata = msg.newMetadata;
            storage.save();
        }

        UpgradeMinterCode => {
            val storage = lazy MinterStorage.load();
            assertSenderIsAdmin(in.senderAddress, storage.adminAddress);
            contract.setCodePostponed(msg.newCode);
            contract.setData(msg.newData);
        }

        TopUpTons => {
            // just accept tons
        }

        else => throw 0xFFFF,
    }
}

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

get fun get_mint_price(): int {
    val storage = lazy MinterStorage.load();
    return storage.mintPrice;
}

get fun get_tokens_per_mint(): int {
    val storage = lazy MinterStorage.load();
    return storage.tokensPerMint;
}
