from __future__ import annotations

import os


def resolve_public_url() -> str:
    explicit = os.environ.get("PUBLIC_URL", "").strip().rstrip("/")
    if explicit:
        return explicit

    railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if railway_domain:
        return f"https://{railway_domain}"

    railway_static = os.environ.get("RAILWAY_STATIC_URL", "").strip().rstrip("/")
    if railway_static:
        return railway_static

    return ""
