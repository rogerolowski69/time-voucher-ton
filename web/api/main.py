from __future__ import annotations

import os
import secrets
from dataclasses import asdict
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from config import resolve_public_url
from db import StoredEvent, get_database_path, init_db, list_events, log_event
from nft_redeem import fetch_redeem_data
from telegram import parse_telegram_user, validate_telegram_init_data
from tx_verify import TxVerificationError, verify_purchase_boc, verify_redeem_boc

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv(Path(__file__).resolve().parent.parent / ".env.local")

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
ADMIN_API_TOKEN = os.environ.get("ADMIN_API_TOKEN", "").strip()
PUBLIC_URL = resolve_public_url()
DIST_DIR = Path(__file__).resolve().parent.parent / "dist"

_cors_origins = [PUBLIC_URL] if PUBLIC_URL else ["*"]

app = FastAPI(title="Time Voucher API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EventBody(BaseModel):
    initData: str | None = None
    walletAddress: str | None = None
    boc: str | None = None
    minterAddress: str | None = None
    redeemAddress: str | None = None
    mintPrice: str | None = None
    jettonAmount: str | None = None
    tonAmount: str | None = None
    network: str | None = None
    note: str | None = None
    nftItemAddress: str | None = None


class WebhookTonBody(BaseModel):
    txHash: str | None = None
    accountId: str | None = None
    nftItemAddress: str | None = None
    walletAddress: str | None = None
    network: str | None = None


class TelegramVerifyBody(BaseModel):
    initData: str = Field(min_length=1)


def public_origin(request: Request) -> str:
    if PUBLIC_URL:
        return PUBLIC_URL
    return str(request.base_url).rstrip("/")


def resolve_telegram_context(init_data: str | None, *, required: bool = False) -> dict[str, Any]:
    if not init_data:
        if required and BOT_TOKEN:
            raise ValueError("initData is required when Telegram auth is enabled")
        return {
            "telegramUserId": None,
            "telegramUsername": None,
            "telegramFirstName": None,
        }

    if BOT_TOKEN:
        validate_telegram_init_data(init_data, BOT_TOKEN, 3600)

    user = parse_telegram_user(init_data)
    if not user:
        if required and BOT_TOKEN:
            raise ValueError("Telegram user data is missing from initData")
        return {
            "telegramUserId": None,
            "telegramUsername": None,
            "telegramFirstName": None,
        }

    return {
        "telegramUserId": user.id,
        "telegramUsername": user.username,
        "telegramFirstName": user.firstName,
    }


def event_payload(event: StoredEvent) -> dict[str, Any]:
    payload = asdict(event)
    return {
        "id": payload["id"],
        "eventType": payload["eventType"],
        "txHash": payload["txHash"],
        "createdAt": payload["createdAt"],
    }


def handle_purchase_log(body: EventBody) -> dict[str, Any]:
    if not body.walletAddress:
        raise HTTPException(status_code=400, detail="walletAddress is required")
    if not body.boc:
        raise HTTPException(status_code=400, detail="boc is required")
    if not body.minterAddress:
        raise HTTPException(status_code=400, detail="minterAddress is required")

    try:
        telegram = resolve_telegram_context(body.initData)
        verified = verify_purchase_boc(
            body.boc,
            wallet_address=body.walletAddress,
            minter_address=body.minterAddress,
            mint_price=body.mintPrice,
            network=body.network,
        )
        tx_hash = verified.tx_hash or verified.body_hash
        event = log_event(
            eventType="purchase",
            walletAddress=body.walletAddress,
            txBoc=body.boc,
            txHash=tx_hash,
            minterAddress=body.minterAddress,
            redeemAddress=body.redeemAddress,
            mintPrice=body.mintPrice,
            jettonAmount=body.jettonAmount,
            tonAmount=body.tonAmount,
            network=body.network,
            note=body.note,
            **telegram,
        )
        return {"ok": True, "event": event_payload(event)}
    except TxVerificationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


def handle_redeem_log(body: EventBody) -> dict[str, Any]:
    if not body.walletAddress:
        raise HTTPException(status_code=400, detail="walletAddress is required")
    if not body.boc:
        raise HTTPException(status_code=400, detail="boc is required")

    try:
        telegram = resolve_telegram_context(body.initData, required=bool(body.redeemAddress))

        if body.nftItemAddress:
            event = log_event(
                eventType="redeem",
                walletAddress=body.walletAddress,
                txBoc=body.boc,
                txHash=None,
                minterAddress=body.nftItemAddress,
                redeemAddress=body.redeemAddress,
                note=body.note or "nft redeem",
                network=body.network,
                **telegram,
            )
            return {"ok": True, "event": event_payload(event)}

        if not body.redeemAddress:
            raise HTTPException(status_code=400, detail="redeemAddress is required")

        verified = verify_redeem_boc(
            body.boc,
            wallet_address=body.walletAddress,
            redeem_address=body.redeemAddress,
            jetton_amount=body.jettonAmount,
            network=body.network,
        )
        tx_hash = verified.tx_hash or verified.body_hash
        event = log_event(
            eventType="redeem",
            walletAddress=body.walletAddress,
            txBoc=body.boc,
            txHash=tx_hash,
            minterAddress=body.minterAddress,
            redeemAddress=body.redeemAddress,
            mintPrice=body.mintPrice,
            jettonAmount=str(verified.jetton_amount),
            tonAmount=body.tonAmount,
            network=body.network,
            note=body.note or "time voucher redeem",
            **telegram,
        )
        return {"ok": True, "event": event_payload(event)}
    except TxVerificationError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "telegramAuthConfigured": bool(BOT_TOKEN),
        "adminApiConfigured": bool(ADMIN_API_TOKEN),
        "publicUrl": PUBLIC_URL or None,
        "eventDatabase": get_database_path(),
        "staticBundleReady": (DIST_DIR / "index.html").exists(),
    }


@app.post("/api/telegram/verify")
def telegram_verify(body: TelegramVerifyBody) -> dict[str, bool]:
    if not BOT_TOKEN:
        raise HTTPException(status_code=503, detail="TELEGRAM_BOT_TOKEN is not configured")

    try:
        validate_telegram_init_data(body.initData, BOT_TOKEN, 3600)
        telegram = resolve_telegram_context(body.initData)
        log_event(eventType="telegram_auth", note="telegram verify", **telegram)
        return {"ok": True}
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error


@app.post("/api/events/purchase")
def log_purchase(body: EventBody) -> dict[str, Any]:
    return handle_purchase_log(body)


@app.post("/api/events/redeem")
def log_redeem(body: EventBody) -> dict[str, Any]:
    return handle_redeem_log(body)


@app.get("/api/nft/redeem-status")
async def nft_redeem_status(
    nftItemAddress: str = Query(min_length=1),
    walletAddress: str = Query(min_length=1),
    network: str | None = Query(default=None),
) -> dict[str, Any]:
    try:
        data = await fetch_redeem_data(nftItemAddress, network=network)
        owner = data["ownerAddress"]
        redeemed = data["redeemed"]
        is_owner = owner == walletAddress
        return {
            "ok": True,
            "ownerAddress": owner,
            "redeemed": redeemed,
            "isOwner": is_owner,
            "canAccessBookingLink": is_owner and redeemed,
            "canOpenRedeemPage": is_owner and not redeemed,
        }
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@app.post("/api/webhooks/ton")
def ton_webhook(
    body: WebhookTonBody,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    """Indexer webhook — use when TonAPI/Toncenter notifies you of on-chain redeem txs."""
    if not ADMIN_API_TOKEN:
        raise HTTPException(status_code=503, detail="ADMIN_API_TOKEN is not configured")

    expected = f"Bearer {ADMIN_API_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not body.walletAddress or not body.nftItemAddress:
        raise HTTPException(status_code=400, detail="walletAddress and nftItemAddress required")

    event = log_event(
        eventType="redeem",
        walletAddress=body.walletAddress,
        txHash=body.txHash,
        minterAddress=body.nftItemAddress,
        note="webhook ton indexer",
        network=body.network,
    )
    return {"ok": True, "event": event_payload(event)}


@app.get("/api/admin/events")
def admin_events(
    authorization: str | None = Header(default=None),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict[str, Any]:
    if not ADMIN_API_TOKEN:
        raise HTTPException(status_code=503, detail="ADMIN_API_TOKEN is not configured")

    expected = f"Bearer {ADMIN_API_TOKEN}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")

    return {
        "ok": True,
        "databasePath": get_database_path(),
        "events": [asdict(event) for event in list_events(limit)],
    }


@app.get("/tonconnect-manifest.json")
def tonconnect_manifest(request: Request) -> dict[str, str]:
    origin = public_origin(request)
    return {
        "url": origin,
        "name": "Time Voucher",
        "iconUrl": f"{origin}/icon.svg",
        "termsOfUseUrl": origin,
        "privacyPolicyUrl": origin,
    }


if DIST_DIR.exists() and (DIST_DIR / "index.html").exists():
    astro_assets = DIST_DIR / "_astro"
    if astro_assets.exists():
        app.mount("/_astro", StaticFiles(directory=astro_assets), name="astro_assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = DIST_DIR / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")
