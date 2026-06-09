from __future__ import annotations

import base64
import os
from dataclasses import dataclass
from typing import Any

import httpx
from pytoniq_core import Address, Cell, Slice
from pytoniq_core.tlb import InternalMsgInfo, MessageAny

BUY_TIME_OPCODE = 0x8F4E2B17
ASK_TO_TRANSFER_OPCODE = 0x0F8A7EA5

TONCENTER_MAINNET = "https://toncenter.com/api/v2"
TONCENTER_TESTNET = "https://testnet.toncenter.com/api/v2"


@dataclass(frozen=True)
class ParsedExternalMessage:
    destination: str
    import_fee: int
    body: Cell
    body_hash: str


@dataclass(frozen=True)
class VerifiedPurchase:
    destination: str
    import_fee: int
    opcode: int
    body_hash: str
    tx_hash: str | None


@dataclass(frozen=True)
class VerifiedRedeem:
    destination: str
    import_fee: int
    opcode: int
    jetton_amount: int
    redeem_address: str
    body_hash: str
    tx_hash: str | None


class TxVerificationError(ValueError):
    pass


def _read_msg_address_int(slice_: Slice) -> tuple[int, bytes]:
    tag = slice_.load_uint(2)
    if tag != 2:
        raise TxVerificationError("Expected internal address in message header")

    slice_.load_uint(1)  # anycast
    workchain = slice_.load_int(8)
    address = slice_.load_bytes(32)
    return workchain, address


def _address_to_str(workchain: int, address: bytes) -> str:
    return Address((workchain, address)).to_str(is_user_friendly=False)


def _skip_msg_address(slice_: Slice) -> None:
    tag = slice_.load_uint(2)
    if tag == 0:
        return
    if tag == 1:
        slice_.load_uint(8)  # workchain
        slice_.load_bytes(32)
        return
    if tag == 2:
        slice_.load_uint(1)
        slice_.load_int(8)
        slice_.load_bytes(32)
        return
    raise TxVerificationError("Unsupported address type in message header")


def _collect_cells(cell: Cell) -> list[Cell]:
    seen: set[str] = set()
    stack = [cell]
    collected: list[Cell] = []

    while stack:
        current = stack.pop()
        cell_hash = current.hash.hex()
        if cell_hash in seen:
            continue
        seen.add(cell_hash)
        collected.append(current)
        stack.extend(current.refs)

    return collected


def _cells_from_boc(boc: str) -> list[Cell]:
    data = base64.b64decode(boc)
    try:
        cells = Cell.from_boc(data)
        if cells:
            return cells
    except Exception:
        pass

    try:
        return [Cell.one_from_boc(data)]
    except Exception as error:
        raise TxVerificationError("Invalid transaction BOC") from error


def _try_parse_message(cell: Cell) -> MessageAny | None:
    try:
        return MessageAny.deserialize(cell.begin_parse())
    except Exception:
        return None


def extract_messages_from_boc(boc: str) -> list[MessageAny]:
    """Parse every MessageAny reachable in a TonConnect signed BOC bag."""
    messages: list[MessageAny] = []
    seen_hashes: set[str] = set()

    for root in _cells_from_boc(boc):
        for cell in _collect_cells(root):
            cell_hash = cell.hash.hex()
            if cell_hash in seen_hashes:
                continue
            seen_hashes.add(cell_hash)

            message = _try_parse_message(cell)
            if message is not None:
                messages.append(message)

    return messages


def _message_destination(message: MessageAny) -> str:
    if isinstance(message.info, InternalMsgInfo):
        return message.info.dest.to_str(is_user_friendly=False)
    return message.info.dest.to_str(is_user_friendly=False)


def _message_value_nanoton(message: MessageAny) -> int:
    if isinstance(message.info, InternalMsgInfo):
        return int(message.info.value_coins)
    return int(message.info.import_fee)


def parse_external_message(boc: str) -> ParsedExternalMessage:
    try:
        root = Cell.one_from_boc(base64.b64decode(boc))
    except Exception as error:
        raise TxVerificationError("Invalid transaction BOC") from error

    slice_ = root.begin_parse()
    info_tag = slice_.load_uint(2)
    if info_tag != 2:
        raise TxVerificationError("Expected external inbound message")

    _skip_msg_address(slice_)  # src
    workchain, address = _read_msg_address_int(slice_)
    destination = _address_to_str(workchain, address)
    import_fee = int(slice_.load_coins())

    has_init = slice_.load_bit()
    if has_init:
        init_tag = slice_.load_bit()
        if init_tag:
            slice_.load_ref()
        else:
            slice_.load_ref()

    body_in_ref = slice_.load_bit()
    if body_in_ref:
        body = slice_.load_ref()
    else:
        if slice_.remaining_bits == 0 and not slice_.remaining_refs:
            raise TxVerificationError("Message body is missing")
        from pytoniq_core import begin_cell

        body = begin_cell().store_slice(slice_).end_cell()

    return ParsedExternalMessage(
        destination=destination,
        import_fee=import_fee,
        body=body,
        body_hash=body.hash.hex(),
    )


def _normalize_address(address: str) -> str:
    return Address(address).to_str(is_user_friendly=False)


def _addresses_equal(left: str, right: str) -> bool:
    try:
        return Address(left) == Address(right)
    except Exception as error:
        raise TxVerificationError("Invalid address in transaction verification") from error


def _toncenter_base(network: str | None) -> str:
    return TONCENTER_TESTNET if network == "testnet" else TONCENTER_MAINNET


def lookup_tx_hash(
    account: str,
    body_hash: str,
    network: str | None,
    api_key: str | None = None,
    limit: int = 12,
) -> str | None:
    params: dict[str, Any] = {"address": account, "limit": limit}
    headers: dict[str, str] = {}
    if api_key:
        headers["X-API-Key"] = api_key

    try:
        response = httpx.get(
            f"{_toncenter_base(network)}/getTransactions",
            params=params,
            headers=headers,
            timeout=8.0,
        )
        response.raise_for_status()
        payload = response.json()
    except Exception:
        return None

    if not payload.get("ok"):
        return None

    for tx in payload.get("result", []):
        in_msg = tx.get("in_msg") or {}
        message_content = in_msg.get("message_content") or {}
        body_boc = message_content.get("body")
        if not body_boc:
            continue
        try:
            body_cell = Cell.one_from_boc(base64.b64decode(body_boc))
        except Exception:
            continue
        if body_cell.hash.hex() == body_hash:
            tx_id = tx.get("transaction_id") or {}
            tx_hash = tx_id.get("hash")
            if tx_hash:
                return tx_hash
    return None


def _verified_purchase_from_message(
    message: MessageAny,
    *,
    expected_minter: str,
    mint_price: str | None,
    wallet_address: str,
    network: str | None,
) -> VerifiedPurchase:
    destination = _message_destination(message)
    if not _addresses_equal(destination, expected_minter):
        raise TxVerificationError(
            f"Transaction destination does not match minter address "
            f"(tx={destination}, expected={expected_minter})"
        )

    body_slice = message.body.begin_parse()
    if body_slice.remaining_bits < 32:
        raise TxVerificationError("Message body is too short")

    opcode = body_slice.load_uint(32)
    if opcode != BUY_TIME_OPCODE:
        raise TxVerificationError("Transaction body is not a BuyTime message")

    value_nanoton = _message_value_nanoton(message)
    if mint_price is not None and value_nanoton < int(mint_price):
        raise TxVerificationError("Attached TON is below declared mint price")

    body_hash = message.body.hash.hex()
    tx_hash = lookup_tx_hash(
        wallet_address,
        body_hash,
        network,
        os.environ.get("TONCENTER_API_KEY", "").strip() or None,
    )

    return VerifiedPurchase(
        destination=destination,
        import_fee=value_nanoton,
        opcode=opcode,
        body_hash=body_hash,
        tx_hash=tx_hash,
    )


def verify_purchase_boc(
    boc: str,
    *,
    wallet_address: str,
    minter_address: str,
    mint_price: str | None,
    network: str | None = None,
) -> VerifiedPurchase:
    expected_minter = _normalize_address(minter_address)
    errors: list[str] = []

    for message in extract_messages_from_boc(boc):
        if not message.is_internal:
            continue
        try:
            return _verified_purchase_from_message(
                message,
                expected_minter=expected_minter,
                mint_price=mint_price,
                wallet_address=wallet_address,
                network=network,
            )
        except TxVerificationError as error:
            errors.append(str(error))

    try:
        parsed = parse_external_message(boc)
        if not _addresses_equal(parsed.destination, expected_minter):
            raise TxVerificationError(
                f"Transaction destination does not match minter address "
                f"(tx={parsed.destination}, expected={expected_minter})"
            )

        body_slice = parsed.body.begin_parse()
        if body_slice.remaining_bits < 32:
            raise TxVerificationError("Message body is too short")

        opcode = body_slice.load_uint(32)
        if opcode != BUY_TIME_OPCODE:
            raise TxVerificationError("Transaction body is not a BuyTime message")

        if mint_price is not None and parsed.import_fee < int(mint_price):
            raise TxVerificationError("Attached TON is below declared mint price")

        body_hash = parsed.body_hash
        tx_hash = lookup_tx_hash(
            wallet_address,
            body_hash,
            network,
            os.environ.get("TONCENTER_API_KEY", "").strip() or None,
        )
        return VerifiedPurchase(
            destination=parsed.destination,
            import_fee=parsed.import_fee,
            opcode=opcode,
            body_hash=body_hash,
            tx_hash=tx_hash,
        )
    except TxVerificationError as error:
        errors.append(str(error))

    detail = errors[0] if errors else "No BuyTime message to minter found in transaction BOC"
    raise TxVerificationError(detail)


def _verified_redeem_from_body(
    *,
    destination: str,
    import_fee: int,
    body: Cell,
    redeem_address: str,
    jetton_amount: str | None,
    wallet_address: str,
    network: str | None,
) -> VerifiedRedeem:
    body_slice = body.begin_parse()
    if body_slice.remaining_bits < 32:
        raise TxVerificationError("Message body is too short")

    opcode = body_slice.load_uint(32)
    if opcode != ASK_TO_TRANSFER_OPCODE:
        raise TxVerificationError("Transaction body is not a jetton transfer")

    body_slice.load_uint(64)  # query_id
    amount = int(body_slice.load_coins())
    recipient_workchain, recipient_address = _read_msg_address_int(body_slice)
    recipient = _address_to_str(recipient_workchain, recipient_address)
    expected_redeem = _normalize_address(redeem_address)

    if recipient != expected_redeem:
        raise TxVerificationError("Jetton transfer recipient does not match redeem address")

    if jetton_amount is not None and amount < int(jetton_amount):
        raise TxVerificationError("Transferred jetton amount is below declared redeem amount")

    body_hash = body.hash.hex()
    tx_hash = lookup_tx_hash(
        wallet_address,
        body_hash,
        network,
        os.environ.get("TONCENTER_API_KEY", "").strip() or None,
    )

    return VerifiedRedeem(
        destination=destination,
        import_fee=import_fee,
        opcode=opcode,
        jetton_amount=amount,
        redeem_address=recipient,
        body_hash=body_hash,
        tx_hash=tx_hash,
    )


def verify_redeem_boc(
    boc: str,
    *,
    wallet_address: str,
    redeem_address: str,
    jetton_amount: str | None,
    network: str | None = None,
) -> VerifiedRedeem:
    errors: list[str] = []

    for message in extract_messages_from_boc(boc):
        if not message.is_internal:
            continue
        try:
            return _verified_redeem_from_body(
                destination=_message_destination(message),
                import_fee=_message_value_nanoton(message),
                body=message.body,
                redeem_address=redeem_address,
                jetton_amount=jetton_amount,
                wallet_address=wallet_address,
                network=network,
            )
        except TxVerificationError as error:
            errors.append(str(error))

    try:
        parsed = parse_external_message(boc)
        return _verified_redeem_from_body(
            destination=parsed.destination,
            import_fee=parsed.import_fee,
            body=parsed.body,
            redeem_address=redeem_address,
            jetton_amount=jetton_amount,
            wallet_address=wallet_address,
            network=network,
        )
    except TxVerificationError as error:
        errors.append(str(error))

    detail = errors[0] if errors else "No jetton transfer to redeem address found in transaction BOC"
    raise TxVerificationError(detail)
