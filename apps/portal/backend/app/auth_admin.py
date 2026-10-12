"""Supabase administrative Auth operations."""

from __future__ import annotations

import os
from uuid import UUID

import httpx

from app.errors import AuthAdminError, AuthAdminTransportError, DuplicateAuthUserError


class SupabaseAuthAdmin:
    def __init__(self) -> None:
        self.base_url = os.environ["SUPABASE_URL"].rstrip("/")
        self.secret_key = os.environ["SUPABASE_SECRET_KEY"]

    @property
    def headers(self) -> dict[str, str]:
        return {
            "apikey": self.secret_key,
            "Content-Type": "application/json",
        }

    def create_user(self, email: str, password: str) -> UUID:
        response = self._request(
            "POST",
            f"{self.base_url}/auth/v1/admin/users",
            json={"email": email, "password": password, "email_confirm": True},
        )
        if response.is_error:
            if _is_duplicate_email(response):
                raise DuplicateAuthUserError(_admin_error(response))
            raise AuthAdminError(_admin_error(response))
        try:
            return UUID(response.json()["id"])
        except (KeyError, TypeError, ValueError) as exc:
            raise AuthAdminError("Supabase Auth returned an invalid user response") from exc

    def delete_user(self, auth_user_id: UUID) -> None:
        response = self._request(
            "DELETE",
            f"{self.base_url}/auth/v1/admin/users/{auth_user_id}",
        )
        if response.is_error and response.status_code != 404:
            raise AuthAdminError(_admin_error(response))

    def find_user_by_email(self, email: str) -> UUID | None:
        page = 1
        while True:
            response = self._request(
                "GET",
                f"{self.base_url}/auth/v1/admin/users",
                params={"page": page, "per_page": 100},
            )
            if response.is_error:
                raise AuthAdminError(_admin_error(response))
            try:
                users = response.json().get("users", [])
                if not isinstance(users, list):
                    raise TypeError
            except (AttributeError, TypeError, ValueError) as exc:
                raise AuthAdminError(
                    "Supabase Auth returned an invalid users response"
                ) from exc
            for user in users:
                try:
                    if user.get("email", "").lower() == email.lower():
                        return UUID(user["id"])
                except (AttributeError, KeyError, TypeError, ValueError) as exc:
                    raise AuthAdminError(
                        "Supabase Auth returned an invalid user response"
                    ) from exc
            if len(users) < 100:
                return None
            page += 1

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        try:
            return httpx.request(
                method,
                url,
                headers=self.headers,
                timeout=15,
                **kwargs,
            )
        except httpx.RequestError as exc:
            raise AuthAdminTransportError(
                "Supabase Auth is unavailable; the operation can be retried"
            ) from exc


def _admin_error(response: httpx.Response) -> str:
    try:
        body = response.json()
        return (
            body.get("msg")
            or body.get("message")
            or body.get("error_description")
            or "Supabase Auth operation failed"
        )
    except ValueError:
        return "Supabase Auth operation failed"


def _is_duplicate_email(response: httpx.Response) -> bool:
    try:
        body = response.json()
    except ValueError:
        body = {}
    detail = " ".join(
        str(body.get(key, ""))
        for key in ("code", "msg", "message", "error", "error_description")
    ).lower()
    return response.status_code in {400, 409, 422} and any(
        marker in detail
        for marker in ("email_exists", "already registered", "already exists")
    )


def get_auth_admin() -> SupabaseAuthAdmin:
    try:
        return SupabaseAuthAdmin()
    except KeyError as exc:
        raise AuthAdminError(f"{exc.args[0]} is not configured") from exc
