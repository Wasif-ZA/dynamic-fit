from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt

from app.models import Role

JWT_SECRET = "fitportal-test-jwt-secret-with-at-least-32-characters"
JWT_ISSUER = "http://supabase.test/auth/v1"

AUTH_USER_IDS = {
    Role.USER: UUID("00000000-0000-0000-0000-000000000101"),
    Role.SUPERVISOR: UUID("00000000-0000-0000-0000-000000000102"),
    Role.ADMINISTRATOR: UUID("00000000-0000-0000-0000-000000000103"),
}


def access_token(
    role: Role = Role.USER,
    *,
    auth_user_id: UUID | None = None,
    expires_delta: timedelta = timedelta(hours=1),
    extra_claims: dict | None = None,
    omit_claims: set[str] | None = None,
    secret: str = JWT_SECRET,
) -> str:
    now = datetime.now(timezone.utc)
    claims = {
        "sub": str(auth_user_id or AUTH_USER_IDS[role]),
        "aud": "authenticated",
        "iss": JWT_ISSUER,
        "iat": now,
        "exp": now + expires_delta,
        "role": "authenticated",
    }
    claims.update(extra_claims or {})
    for claim in omit_claims or set():
        claims.pop(claim, None)
    return jwt.encode(
        claims,
        secret,
        algorithm="HS256",
    )


def auth_headers(role: Role = Role.USER, **kwargs) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token(role, **kwargs)}"}
