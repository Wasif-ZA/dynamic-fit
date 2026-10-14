"""Supabase token authentication and Portal role authorisation."""

from __future__ import annotations

from collections.abc import Callable
import os
from typing import Annotated
from uuid import UUID

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError

from app.database import session_scope
from app.models import PortalUser, Role, UserStatus
from app.repositories import users as user_repository

_bearer = HTTPBearer(auto_error=False)
_jwks_clients: dict[str, PyJWKClient] = {}


def verify_auth_configuration() -> None:
    missing = [
        name
        for name in ("SUPABASE_URL", "SUPABASE_SECRET_KEY")
        if not os.getenv(name, "").strip()
    ]
    if missing:
        raise RuntimeError(f"Missing authentication configuration: {', '.join(missing)}")
    if not any(
        os.getenv(name, "").strip()
        for name in ("SUPABASE_JWT_SECRET", "SUPABASE_JWKS_URL")
    ):
        raise RuntimeError(
            "Configure SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL for token verification"
        )
    if len(os.getenv("VISUALIZER_TOKEN_SECRET", "")) < 32:
        raise RuntimeError(
            "VISUALIZER_TOKEN_SECRET must contain at least 32 characters"
        )


def _unauthenticated() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="A valid Supabase access token is required",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _issuer() -> str:
    configured = os.getenv("SUPABASE_JWT_ISSUER", "").strip()
    if configured:
        return configured.rstrip("/")
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    if not url:
        raise RuntimeError("SUPABASE_URL or SUPABASE_JWT_ISSUER must be configured")
    return f"{url}/auth/v1"


def verify_access_token(token: str) -> UUID:
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg")
        options = {
            "algorithms": [algorithm],
            "audience": os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated"),
            "issuer": _issuer(),
            "options": {"require": ["exp", "sub", "aud", "iss"]},
        }
        if algorithm == "HS256":
            secret = os.getenv("SUPABASE_JWT_SECRET", "")
            if not secret:
                raise RuntimeError("SUPABASE_JWT_SECRET is required for HS256 tokens")
            claims = jwt.decode(token, secret, **options)
        elif algorithm in {"RS256", "ES256"}:
            jwks_url = os.getenv("SUPABASE_JWKS_URL", "").strip()
            if not jwks_url:
                jwks_url = f"{_issuer()}/.well-known/jwks.json"
            client = _jwks_clients.setdefault(jwks_url, PyJWKClient(jwks_url))
            signing_key = client.get_signing_key_from_jwt(token)
            claims = jwt.decode(token, signing_key.key, **options)
        else:
            raise InvalidTokenError("Unsupported signing algorithm")
        if claims.get("role") != "authenticated":
            raise InvalidTokenError("Token is not an end-user access token")
        return UUID(claims["sub"])
    except (InvalidTokenError, PyJWKClientError, KeyError, TypeError, ValueError):
        raise _unauthenticated() from None


def get_current_user(
    credentials: Annotated[
        HTTPAuthorizationCredentials | None, Depends(_bearer)
    ],
) -> PortalUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthenticated()
    try:
        auth_user_id = verify_access_token(credentials.credentials)
    except RuntimeError:
        raise _unauthenticated() from None

    with session_scope() as session:
        user = user_repository.find_by_auth_user_id(session, auth_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Supabase identity has no Portal account",
        )
    if user.status == UserStatus.DISABLED:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This Portal account is disabled",
        )
    return user


def require_roles(*allowed_roles: Role) -> Callable[..., PortalUser]:
    def require_role(
        user: Annotated[PortalUser, Depends(get_current_user)],
    ) -> PortalUser:
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your role does not have permission to perform this action",
            )
        return user

    return require_role


require_solver_user = require_roles(Role.SUPERVISOR, Role.ADMINISTRATOR)
require_inventory_manager = require_roles(Role.SUPERVISOR, Role.ADMINISTRATOR)
require_finalisation_user = require_roles(Role.SUPERVISOR, Role.ADMINISTRATOR)
require_user_manager = require_roles(Role.SUPERVISOR, Role.ADMINISTRATOR)
