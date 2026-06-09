from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("ADMIN_API_TOKEN", "test-token")

from tx_verify import TxVerificationError, verify_purchase_boc

# Wallet-signed external message with nested internal BuyTime to minter (generated via @ton/core).
WALLET_WRAPPED_BOC = "te6cckEBAgEAtgAB4YgBVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAU1NGLtRQHW4AAAACAAcAQCAYgAIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiIiKDuaygAAAAAAAAAAAAAAAAAAI9OKxcAAAAAAAAAAKUeBZM="
MINTER = "0:1111111111111111111111111111111111111111111111111111111111111111"
WALLET = "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"


def test_verify_purchase_accepts_wallet_wrapped_boc() -> None:
    verified = verify_purchase_boc(
        WALLET_WRAPPED_BOC,
        wallet_address=WALLET,
        minter_address=MINTER,
        mint_price="100000000",
        network="testnet",
    )

    assert verified.opcode == 0x8F4E2B17
    assert verified.destination == MINTER
    assert verified.import_fee == 500_000_000


def test_verify_purchase_rejects_wrong_minter() -> None:
    try:
        verify_purchase_boc(
            WALLET_WRAPPED_BOC,
            wallet_address=WALLET,
            minter_address="0:" + "22" * 32,
            mint_price="100000000",
            network="testnet",
        )
    except TxVerificationError as error:
        assert "minter address" in str(error).lower()
    else:
        raise AssertionError("expected TxVerificationError")
