from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "test-token")
os.environ.setdefault("ADMIN_API_TOKEN", "test-admin")

from main import app  # noqa: E402
from telegram_bot import handle_telegram_update, mini_app_url

client = TestClient(app)


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


def test_telegram_webhook_rejects_missing_secret(monkeypatch) -> None:
    import main as main_module

    monkeypatch.setattr(main_module, "TELEGRAM_WEBHOOK_SECRET", "super-secret")
    response = client.post(
        "/api/webhooks/telegram",
        json={"message": {"chat": {"id": 1}, "text": "/start"}},
    )
    assert response.status_code == 401


def test_telegram_webhook_accepts_valid_secret(monkeypatch) -> None:
    import main as main_module

    monkeypatch.setattr(main_module, "TELEGRAM_WEBHOOK_SECRET", "super-secret")

    async def noop(update: dict) -> None:
        return None

    monkeypatch.setattr("main.handle_telegram_update", noop)
    response = client.post(
        "/api/webhooks/telegram",
        json={"message": {"chat": {"id": 1}, "text": "/start"}},
        headers={"X-Telegram-Bot-Api-Secret-Token": "super-secret"},
    )
    assert response.status_code == 200
    assert response.json() == {"ok": True}
