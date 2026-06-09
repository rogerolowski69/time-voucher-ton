from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

API_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(API_DIR))

os.environ.setdefault("TELEGRAM_BOT_TOKEN", "")
os.environ.setdefault("ADMIN_API_TOKEN", "test-token")

from main import app  # noqa: E402

client = TestClient(app)


def test_tonconnect_manifest_uses_forwarded_host() -> None:
    response = client.get(
        "/tonconnect-manifest.json",
        headers={
            "X-Forwarded-Host": "localhost:4321",
            "X-Forwarded-Proto": "http",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["url"] == "http://localhost:4321"
    assert body["name"] == "Time Voucher"
    assert body["iconUrl"] == "http://localhost:4321/icon-180.png"
    assert body["termsOfUseUrl"] == "http://localhost:4321"
    assert body["privacyPolicyUrl"] == "http://localhost:4321"
    assert "icon.svg" not in body["iconUrl"]


def test_tonconnect_manifest_prefers_forwarded_host_over_public_url(monkeypatch) -> None:
    import main as main_module

    monkeypatch.setattr(main_module, "PUBLIC_URL", "http://localhost:4321")
    response = client.get(
        "/tonconnect-manifest.json",
        headers={
            "X-Forwarded-Host": "127.0.0.1:4321",
            "X-Forwarded-Proto": "http",
        },
    )
    assert response.status_code == 200
    assert response.json()["url"] == "http://127.0.0.1:4321"


def test_tonconnect_manifest_falls_back_to_public_url(monkeypatch) -> None:
    import main as main_module

    monkeypatch.setattr(
        main_module,
        "PUBLIC_URL",
        "https://time-voucher-ton-production.up.railway.app",
    )
    response = client.get("/tonconnect-manifest.json")
    assert response.status_code == 200
    body = response.json()
    production = "https://time-voucher-ton-production.up.railway.app"
    assert body["url"] == production
    assert body["iconUrl"] == f"{production}/icon-180.png"
    assert body["termsOfUseUrl"] == production
    assert body["privacyPolicyUrl"] == production
