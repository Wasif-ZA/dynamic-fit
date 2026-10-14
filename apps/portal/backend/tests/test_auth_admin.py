from uuid import uuid4

import httpx
import pytest

from app.auth_admin import SupabaseAuthAdmin
from app.errors import AuthAdminTransportError, DuplicateAuthUserError


@pytest.fixture
def auth_admin(monkeypatch):
    monkeypatch.setenv("SUPABASE_URL", "http://supabase.test")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test-key")
    return SupabaseAuthAdmin()


def test_modern_secret_key_is_sent_only_as_an_api_key(auth_admin):
    assert auth_admin.headers == {
        "apikey": "sb_secret_test-key",
        "Content-Type": "application/json",
    }
    assert "Authorization" not in auth_admin.headers


def test_transport_failures_are_wrapped(auth_admin, monkeypatch):
    def fail(*_args, **_kwargs):
        raise httpx.ConnectError(
            "unreachable",
            request=httpx.Request("GET", "http://supabase.test"),
        )

    monkeypatch.setattr(httpx, "request", fail)

    with pytest.raises(AuthAdminTransportError):
        auth_admin.find_user_by_email("person@fitportal.test")


def test_duplicate_email_response_is_a_conflict(auth_admin, monkeypatch):
    monkeypatch.setattr(
        httpx,
        "request",
        lambda *_args, **_kwargs: httpx.Response(
            422,
            json={"code": "email_exists", "message": "Email already exists"},
        ),
    )

    with pytest.raises(DuplicateAuthUserError):
        auth_admin.create_user("person@fitportal.test", "safe-password")


def test_delete_ignores_an_already_missing_identity(auth_admin, monkeypatch):
    monkeypatch.setattr(
        httpx,
        "request",
        lambda *_args, **_kwargs: httpx.Response(404, json={"message": "not found"}),
    )

    auth_admin.delete_user(uuid4())
