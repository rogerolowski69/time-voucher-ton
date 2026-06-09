from __future__ import annotations

import os
from typing import Any

import httpx

from config import resolve_public_url


def mini_app_url() -> str:
    explicit = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
    if explicit:
        return explicit
    return resolve_public_url() or "https://time-voucher-ton-production.up.railway.app"


async def send_telegram_message(chat_id: int, text: str, *, web_app_url: str | None = None) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        return

    payload: dict[str, Any] = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    if web_app_url:
        payload["reply_markup"] = {
            "inline_keyboard": [
                [
                    {
                        "text": "Open Time Voucher",
                        "web_app": {"url": web_app_url},
                    }
                ]
            ]
        }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json=payload,
        )
        response.raise_for_status()


async def handle_telegram_update(update: dict[str, Any]) -> None:
    message = update.get("message") or {}
    text = (message.get("text") or "").strip()
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if not isinstance(chat_id, int):
        return

    if not text.startswith("/start"):
        return

    app_url = mini_app_url()
    await send_telegram_message(
        chat_id,
        (
            "<b>Time Voucher</b>\n\n"
            "Tap the button below to open the mini app, connect your TON wallet, "
            "and redeem your NFT hour.\n\n"
            f"<code>{app_url}</code>"
        ),
        web_app_url=app_url,
    )
