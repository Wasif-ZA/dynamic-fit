"""Provision a migrated test database, refusing implicit non-local targets."""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

TEST_DATABASE_URL_VARIABLE = "FITPORTAL_TEST_DATABASE_URL"
os.environ.setdefault(
    "SUPABASE_JWT_SECRET",
    "fitportal-test-jwt-secret-with-at-least-32-characters",
)
os.environ.setdefault("SUPABASE_JWT_ISSUER", "http://supabase.test/auth/v1")
os.environ.setdefault("SUPABASE_URL", "http://supabase.test")
os.environ.setdefault("SUPABASE_SECRET_KEY", "sb_secret_test-key")
os.environ.setdefault(
    "VISUALIZER_TOKEN_SECRET",
    "fitportal-test-visualizer-secret-with-at-least-32-characters",
)

DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/fitportal_test"
)

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "supabase" / "migrations"

UNREACHABLE = (
    "The Portal test database is unreachable.\n\n"
    "Start the local Supabase stack from the repository root:\n"
    "    supabase start\n\n"
    f"Or point {TEST_DATABASE_URL_VARIABLE} at another local PostgreSQL "
    "database. Never point it at a shared or hosted project."
)


TEST_DATABASE_NAME = "fitportal_test"

LOCAL_HOSTS = frozenset(
    {"127.0.0.1", "localhost", "::1", "host.docker.internal", ""}
)

NOT_LOCAL = (
    "Refusing to run the test suite against a non-local database host.\n\n"
    "The suite drops and recreates its schema, so it must never be pointed at a "
    "shared or hosted Supabase project. Use the local Supabase stack, or set "
    f"{TEST_DATABASE_URL_VARIABLE} explicitly if you really do mean another host."
)


def _test_database_url() -> str:
    explicit = os.getenv(TEST_DATABASE_URL_VARIABLE)
    if explicit:
        return explicit

    configured = os.getenv("DATABASE_URL")
    url = (
        make_url(configured).set(database=TEST_DATABASE_NAME)
        if configured
        else make_url(DEFAULT_TEST_DATABASE_URL)
    )
    if (url.host or "") not in LOCAL_HOSTS:
        raise pytest.UsageError(NOT_LOCAL)
    return url.render_as_string(hide_password=False)


def _ensure_database_exists(url: str) -> None:
    target = make_url(url)
    maintenance = target.set(database="postgres")
    engine = create_engine(maintenance, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            exists = connection.scalar(
                text("SELECT 1 FROM pg_database WHERE datname = :name"),
                {"name": target.database},
            )
            if not exists:
                # The database name comes from configuration, never from a
                # request, and is quoted for the identifier position.
                connection.execute(
                    text(f'CREATE DATABASE "{target.database}"')
                )
    except SQLAlchemyError as exc:
        raise pytest.UsageError(UNREACHABLE) from exc
    finally:
        engine.dispose()


def _apply_migrations(url: str) -> None:
    migrations = sorted(MIGRATIONS_DIRECTORY.glob("*.sql"))
    if not migrations:
        raise pytest.UsageError(f"No migrations found in {MIGRATIONS_DIRECTORY}")

    engine = create_engine(url, isolation_level="AUTOCOMMIT")
    try:
        with engine.connect() as connection:
            connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            connection.execute(text("CREATE SCHEMA public"))
            for migration in migrations:
                connection.execute(text(migration.read_text()))
    except SQLAlchemyError as exc:
        raise pytest.UsageError(UNREACHABLE) from exc
    finally:
        engine.dispose()


@pytest.fixture(scope="session", autouse=True)
def portal_test_database() -> None:
    url = _test_database_url()
    _ensure_database_exists(url)
    _apply_migrations(url)

    os.environ["DATABASE_URL"] = url

    from app import database

    database.dispose_engine()
    database.verify_connection()
    yield
    database.dispose_engine()


@pytest.fixture(scope="session", autouse=True)
def portal_test_users(portal_test_database) -> None:
    from app.database import session_scope
    from app.models import Role
    from app.repositories import users as user_repository
    from tests.auth_helpers import AUTH_USER_IDS

    with session_scope() as session:
        for role in Role:
            user_repository.create_user(
                session,
                auth_user_id=AUTH_USER_IDS[role],
                email=f"{role.value.lower()}@fitportal.test",
                display_name=role.value.title(),
                role=role,
            )


@pytest.fixture(autouse=True)
def default_authenticated_client(request, portal_test_users):
    from fastapi.testclient import TestClient
    from tests.auth_helpers import auth_headers

    client = getattr(request.module, "client", None)
    if not isinstance(client, TestClient):
        yield
        return
    previous = client.headers.get("Authorization")
    client.headers.update(auth_headers())
    yield
    if previous is None:
        client.headers.pop("Authorization", None)
    else:
        client.headers["Authorization"] = previous
