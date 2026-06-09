from __future__ import annotations

import asyncio

from telegram_bot import handle_telegram_update, mini_app_url


def test_handle_start_sends_message(monkeypatch) -> None:
    sent: list[dict] = []

    async def fake_send(chat_id: int, text: str, *, web_app_url: str | None = None) -> None:
        sent.append({"chat_id": chat_id, "text": text, "web_app_url": web_app_url})

    monkeypatch.setattr("telegram_bot.send_telegram_message", fake_send)
    monkeypatch.setenv("PUBLIC_URL", "https://example.test")

    asyncio.run(
        handle_telegram_update(
            {
                "message": {
                    "chat": {"id": 42},
                    "text": "/start",
                }
            }
        )
    )

    assert len(sent) == 1
    assert sent[0]["chat_id"] == 42
    assert sent[0]["web_app_url"] == "https://example.test"
    assert "Time Voucher" in sent[0]["text"]


def test_mini_app_url_prefers_public_url(monkeypatch) -> None:
    monkeypatch.setenv("PUBLIC_URL", "https://app.example")
    assert mini_app_url() == "https://app.example"
