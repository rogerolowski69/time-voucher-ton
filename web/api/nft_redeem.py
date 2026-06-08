from __future__ import annotations

import os
from typing import Any

import httpx

TONCENTER_MAINNET = "https://toncenter.com/api/v2"
TONCENTER_TESTNET = "https://testnet.toncenter.com/api/v2"


def toncenter_base(network: str | None) -> str:
    return TONCENTER_TESTNET if network == "testnet" else TONCENTER_MAINNET


async def fetch_redeem_data(
    nft_item_address: str,
    *,
    network: str | None = None,
) -> dict[str, Any]:
    api_key = os.environ.get("TONCENTER_API_KEY", "").strip() or None
    base = toncenter_base(network)
    params: dict[str, str] = {"address": nft_item_address, "method": "get_redeem_data", "stack": "[]"}
    headers = {"X-API-Key": api_key} if api_key else {}

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(f"{base}/runGetMethod", json=params, headers=headers)
        response.raise_for_status()
        payload = response.json()

    if not payload.get("ok"):
        raise ValueError(payload.get("error", "get_redeem_data failed"))

    stack = payload.get("stack") or []
    if len(stack) < 2:
        raise ValueError("Unexpected get_redeem_data stack")

    owner = stack[0].get("value", "")
    redeemed_cell = stack[1]
    redeemed = redeemed_cell.get("value") in {"-1", "1", 1, True}

    return {
        "ownerAddress": owner,
        "redeemed": redeemed,
    }
