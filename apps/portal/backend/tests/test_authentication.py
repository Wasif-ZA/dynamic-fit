from datetime import timedelta
from uuid import uuid4

import jwt
import pytest
from fastapi.testclient import TestClient

from app.database import session_scope
from app.auth import verify_auth_configuration
from app.main import app
from app.models import Role, UserStatus
from app.repositories import users as user_repository
from tests.auth_helpers import AUTH_USER_IDS, access_token, auth_headers

client = TestClient(app)


def test_valid_token_returns_database_profile():
    response = client.get("/auth/me", headers=auth_headers(Role.USER))

    assert response.status_code == 200
    assert response.json()["AuthUserId"] == str(AUTH_USER_IDS[Role.USER])
    assert response.json()["Role"] == "USER"


def test_missing_token_is_unauthenticated():
    response = client.get("/orders", headers={"Authorization": ""})

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_invalid_token_is_unauthenticated():
    assert client.get(
        "/orders", headers={"Authorization": "Bearer not-a-jwt"}
    ).status_code == 401


def test_wrong_signature_is_unauthenticated():
    token = access_token(secret="a-different-secret-with-at-least-32-characters")
    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_wrong_issuer_is_unauthenticated():
    token = access_token(extra_claims={"iss": "https://wrong.example/auth/v1"})
    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_wrong_audience_is_unauthenticated():
    token = access_token(extra_claims={"aud": "wrong-audience"})
    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_unsigned_token_is_unauthenticated():
    token = jwt.encode(
        {"sub": str(uuid4()), "aud": "authenticated", "role": "authenticated"},
        key="",
        algorithm="none",
    )
    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_non_user_supabase_jwts_are_unauthenticated():
    for token_role in ("anon", "service_role"):
        token = access_token(extra_claims={"role": token_role})
        assert client.get(
            "/orders", headers={"Authorization": f"Bearer {token}"}
        ).status_code == 401


def test_expired_token_is_unauthenticated():
    token = access_token(expires_delta=timedelta(seconds=-1))

    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_token_without_expiry_is_unauthenticated():
    token = access_token(omit_claims={"exp"})

    assert client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    ).status_code == 401


def test_valid_supabase_identity_without_portal_user_is_forbidden():
    token = access_token(auth_user_id=uuid4())

    response = client.get(
        "/orders", headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 403
    assert "no Portal account" in response.json()["detail"]


def test_disabled_portal_account_is_forbidden():
    with session_scope() as session:
        record = user_repository.lock_user_by_auth_user_id(
            session, AUTH_USER_IDS[Role.USER]
        )
        user_repository.set_status(session, record, UserStatus.DISABLED)
    try:
        response = client.get("/orders", headers=auth_headers(Role.USER))
        assert response.status_code == 403
        assert "disabled" in response.json()["detail"]
    finally:
        with session_scope() as session:
            record = user_repository.lock_user_by_auth_user_id(
                session, AUTH_USER_IDS[Role.USER]
            )
            user_repository.set_status(session, record, UserStatus.ACTIVE)


def test_client_token_metadata_cannot_escalate_database_role():
    token = access_token(
        Role.USER,
        extra_claims={"user_metadata": {"role": "ADMINISTRATOR"}},
    )

    response = client.post(
        "/boxes",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "Reference": "ESCALATION",
            "Width": 1,
            "Length": 1,
            "Depth": 1,
            "MaximumBoxes": 1,
        },
    )

    assert response.status_code == 403


def test_solution_routes_require_authentication():
    for path, method in (
        ("/orders/ORD-001/solution", "get"),
        ("/orders/ORD-001/solution/summary", "get"),
        ("/orders/ORD-001/visualizer-handoff", "post"),
    ):
        response = getattr(client, method)(path, headers={"Authorization": ""})
        assert response.status_code == 401


def test_every_application_route_has_an_unauthenticated_boundary():
    excluded = {
        "/docs",
        "/docs/oauth2-redirect",
        "/health",
        "/openapi.json",
        "/redoc",
        "/orders/{order_id}/solution/visualizer",
    }
    replacements = {
        "{order_id}": "ORD-000",
        "{reference}": "BOX",
        "{user_id}": str(uuid4()),
    }
    checked = []
    pending = list(app.routes)
    while pending:
        route = pending.pop()
        nested = getattr(route, "routes", None)
        if nested is None and hasattr(route, "original_router"):
            nested = route.original_router.routes
        if nested is not None:
            pending.extend(nested)
            continue
        if not getattr(route, "methods", None) or route.path in excluded:
            continue
        path = route.path
        for placeholder, value in replacements.items():
            path = path.replace(placeholder, value)
        for method in route.methods - {"HEAD", "OPTIONS"}:
            response = client.request(
                method,
                path,
                headers={"Authorization": ""},
                json={},
            )
            assert response.status_code == 401, f"{method} {route.path}"
            checked.append((method, route.path))
    assert checked


def test_auth_configuration_requires_a_verification_method(monkeypatch):
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.delenv("SUPABASE_JWKS_URL", raising=False)

    try:
        verify_auth_configuration()
    except RuntimeError as error:
        assert "SUPABASE_JWT_SECRET or SUPABASE_JWKS_URL" in str(error)
    else:
        raise AssertionError("Missing JWT verification configuration was accepted")


def test_auth_configuration_requires_modern_secret_key(monkeypatch):
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)

    with pytest.raises(RuntimeError, match="SUPABASE_SECRET_KEY"):
        verify_auth_configuration()


def test_auth_configuration_accepts_explicit_jwks_without_shared_secret(monkeypatch):
    monkeypatch.delenv("SUPABASE_JWT_SECRET", raising=False)
    monkeypatch.setenv("SUPABASE_JWKS_URL", "https://supabase.test/.well-known/jwks.json")

    verify_auth_configuration()
