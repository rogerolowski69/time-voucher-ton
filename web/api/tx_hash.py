from __future__ import annotations

import base64

from pytoniq_core import Cell


def hash_from_tx_boc(boc: str) -> str | None:
    try:
        cell = Cell.one_from_boc(base64.b64decode(boc))
        return cell.hash.hex()
    except Exception:
        return None
