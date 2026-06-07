from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl


@dataclass
class TelegramUserFromInitData:
    id: int
    username: str | None
    firstName: str | None
    lastName: str | None


def validate_telegram_init_data(init_data: str, bot_token: str, expires_in_seconds: int = 3600) -> None:
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = params.pop("hash", None)
    if not received_hash:
        raise ValueError("Missing hash in initData")

    data_check_string = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    calculated_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(received_hash, calculated_hash):
        raise ValueError("Invalid Telegram initData signature")

    auth_date = int(params.get("auth_date", "0"))
    if auth_date <= 0:
        raise ValueError("Missing auth_date in initData")

    age_seconds = int(time.time()) - auth_date
    if age_seconds > expires_in_seconds:
        raise ValueError("Telegram initData has expired")


def parse_telegram_user(init_data: str) -> TelegramUserFromInitData | None:
    params = dict(parse_qsl(init_data, keep_blank_values=True))
    user_raw = params.get("user")
    if not user_raw:
        return None

    try:
        user = json.loads(user_raw)
    except json.JSONDecodeError:
        return None

    return TelegramUserFromInitData(
        id=int(user["id"]),
        username=user.get("username"),
        firstName=user.get("first_name"),
        lastName=user.get("last_name"),
    )
