#!/usr/bin/env python3
"""Create the initial Administrator and Supervisor idempotently."""

from __future__ import annotations

import os
from pathlib import Path
import sys

from dotenv import load_dotenv

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
load_dotenv(BACKEND_ROOT / ".env", override=False)

from app.auth_admin import SupabaseAuthAdmin
from app.database import session_scope
from app.models import Role
from app.repositories import users as user_repository


def required(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SystemExit(f"{name} is required")
    return value


def provision(
    admin: SupabaseAuthAdmin,
    *,
    email: str,
    password: str,
    display_name: str | None,
    role: Role,
) -> None:
    with session_scope() as session:
        existing = user_repository.find_by_email(session, email)
    if existing:
        if existing.role != role:
            raise SystemExit(f"{email} already exists with role {existing.role}")
        print(f"Already configured: {email} ({role})")
        return

    auth_user_id = admin.find_user_by_email(email)
    created_auth = auth_user_id is None
    if auth_user_id is None:
        auth_user_id = admin.create_user(email, password)
    try:
        with session_scope() as session:
            user_repository.create_user(
                session,
                auth_user_id=auth_user_id,
                email=email,
                display_name=display_name,
                role=role,
            )
    except Exception:
        if created_auth:
            admin.delete_user(auth_user_id)
        raise
    print(f"Created: {email} ({role})")


def main() -> None:
    admin = SupabaseAuthAdmin()
    provision(
        admin,
        email=required("BOOTSTRAP_ADMIN_EMAIL").lower(),
        password=required("BOOTSTRAP_ADMIN_PASSWORD"),
        display_name=os.getenv("BOOTSTRAP_ADMIN_DISPLAY_NAME") or None,
        role=Role.ADMINISTRATOR,
    )
    provision(
        admin,
        email=required("BOOTSTRAP_SUPERVISOR_EMAIL").lower(),
        password=required("BOOTSTRAP_SUPERVISOR_PASSWORD"),
        display_name=os.getenv("BOOTSTRAP_SUPERVISOR_DISPLAY_NAME") or None,
        role=Role.SUPERVISOR,
    )


if __name__ == "__main__":
    main()
