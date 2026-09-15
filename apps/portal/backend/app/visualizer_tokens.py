"""Short-lived tokens for FitVisualizer's URL-fetch contract."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from uuid import uuid4

import jwt
from jwt import InvalidTokenError

AUDIENCE = "fitportal-visualizer"
DEFAULT_TTL_SECONDS = 300


def solution_digest(solution: dict) -> str:
    encoded = json.dumps(solution, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def create_token(order_id: str, solution: dict) -> tuple[str, int]:
    secret = _secret()
    ttl = int(os.getenv("VISUALIZER_TOKEN_TTL_SECONDS", DEFAULT_TTL_SECONDS))
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "aud": AUDIENCE,
            "sub": order_id,
            "solution": solution_digest(solution),
            "iat": now,
            "exp": now + timedelta(seconds=ttl),
            "jti": str(uuid4()),
        },
        secret,
        algorithm="HS256",
    )
    return token, ttl


def verify_token(token: str, order_id: str) -> str:
    try:
        claims = jwt.decode(
            token,
            _secret(),
            algorithms=["HS256"],
            audience=AUDIENCE,
            options={"require": ["exp", "iat", "sub", "solution"]},
        )
    except (InvalidTokenError, RuntimeError, ValueError):
        raise ValueError("Invalid or expired visualizer handoff") from None
    if claims["sub"] != order_id:
        raise ValueError("Invalid or expired visualizer handoff")
    return claims["solution"]


def _secret() -> str:
    secret = os.getenv("VISUALIZER_TOKEN_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("VISUALIZER_TOKEN_SECRET must contain at least 32 characters")
    return secret
