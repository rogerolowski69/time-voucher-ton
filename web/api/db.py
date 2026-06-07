from __future__ import annotations

import os
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

EventType = Literal["telegram_auth", "purchase", "redeem"]

DATA_DIR = Path(os.environ.get("DATA_DIR", "").strip() or Path(__file__).resolve().parent.parent / "data")
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "events.db"


@dataclass
class StoredEvent:
    id: int
    eventType: str
    createdAt: str
    walletAddress: str | None
    telegramUserId: int | None
    telegramUsername: str | None
    telegramFirstName: str | None
    txBoc: str | None
    txHash: str | None
    minterAddress: str | None
    redeemAddress: str | None
    mintPrice: str | None
    jettonAmount: str | None
    tonAmount: str | None
    network: str | None
    note: str | None


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL")
    return conn


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_type TEXT NOT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              wallet_address TEXT,
              telegram_user_id INTEGER,
              telegram_username TEXT,
              telegram_first_name TEXT,
              tx_boc TEXT,
              tx_hash TEXT,
              minter_address TEXT,
              redeem_address TEXT,
              mint_price TEXT,
              jetton_amount TEXT,
              ton_amount TEXT,
              network TEXT,
              note TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_events_type_created
              ON events (event_type, created_at DESC);

            CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tx_hash_unique
              ON events (tx_hash)
              WHERE tx_hash IS NOT NULL;
            """
        )


def _row_to_event(row: sqlite3.Row) -> StoredEvent:
    return StoredEvent(
        id=row["id"],
        eventType=row["event_type"],
        createdAt=row["created_at"],
        walletAddress=row["wallet_address"],
        telegramUserId=row["telegram_user_id"],
        telegramUsername=row["telegram_username"],
        telegramFirstName=row["telegram_first_name"],
        txBoc=row["tx_boc"],
        txHash=row["tx_hash"],
        minterAddress=row["minter_address"],
        redeemAddress=row["redeem_address"],
        mintPrice=row["mint_price"],
        jettonAmount=row["jetton_amount"],
        tonAmount=row["ton_amount"],
        network=row["network"],
        note=row["note"],
    )


def find_event_by_tx_hash(tx_hash: str) -> StoredEvent | None:
    with _connect() as conn:
        row = conn.execute(
            """
            SELECT
              id,
              event_type,
              created_at,
              wallet_address,
              telegram_user_id,
              telegram_username,
              telegram_first_name,
              tx_boc,
              tx_hash,
              minter_address,
              redeem_address,
              mint_price,
              jetton_amount,
              ton_amount,
              network,
              note
            FROM events
            WHERE tx_hash = ?
            LIMIT 1
            """,
            (tx_hash,),
        ).fetchone()
        return _row_to_event(row) if row else None


def log_event(**fields: Any) -> StoredEvent:
    tx_hash = fields.get("txHash")
    if tx_hash:
        existing = find_event_by_tx_hash(tx_hash)
        if existing:
            return existing

    with _connect() as conn:
        cursor = conn.execute(
            """
            INSERT INTO events (
              event_type,
              wallet_address,
              telegram_user_id,
              telegram_username,
              telegram_first_name,
              tx_boc,
              tx_hash,
              minter_address,
              redeem_address,
              mint_price,
              jetton_amount,
              ton_amount,
              network,
              note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fields.get("eventType"),
                fields.get("walletAddress"),
                fields.get("telegramUserId"),
                fields.get("telegramUsername"),
                fields.get("telegramFirstName"),
                fields.get("txBoc"),
                fields.get("txHash"),
                fields.get("minterAddress"),
                fields.get("redeemAddress"),
                fields.get("mintPrice"),
                fields.get("jettonAmount"),
                fields.get("tonAmount"),
                fields.get("network"),
                fields.get("note"),
            ),
        )
        row = conn.execute(
            """
            SELECT
              id,
              event_type,
              created_at,
              wallet_address,
              telegram_user_id,
              telegram_username,
              telegram_first_name,
              tx_boc,
              tx_hash,
              minter_address,
              redeem_address,
              mint_price,
              jetton_amount,
              ton_amount,
              network,
              note
            FROM events
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()
        assert row is not None
        return _row_to_event(row)


def list_events(limit: int = 100) -> list[StoredEvent]:
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT
              id,
              event_type,
              created_at,
              wallet_address,
              telegram_user_id,
              telegram_username,
              telegram_first_name,
              tx_boc,
              tx_hash,
              minter_address,
              redeem_address,
              mint_price,
              jetton_amount,
              ton_amount,
              network,
              note
            FROM events
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [_row_to_event(row) for row in rows]


def get_database_path() -> str:
    return str(DB_PATH)
