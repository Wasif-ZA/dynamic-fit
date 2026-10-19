"""Database configuration fails loudly; it never falls back to process memory."""

from __future__ import annotations

import pytest

from app import database
from app.database import DatabaseNotConfiguredError, DatabaseUnavailableError


@pytest.fixture
def restored_engine():
    yield
    database.dispose_engine()


def test_a_missing_database_url_is_a_configuration_error(monkeypatch, restored_engine):
    monkeypatch.setattr(database, "_ENV_FILE", database.Path("/nonexistent/.env"))
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(DatabaseNotConfiguredError) as failure:
        database.get_database_url()

    assert "DATABASE_URL" in str(failure.value)


def test_a_non_postgresql_database_url_is_rejected(monkeypatch, restored_engine):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///portal.db")

    with pytest.raises(DatabaseNotConfiguredError):
        database.get_database_url()


def test_a_plain_postgresql_url_is_given_the_psycopg_driver(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pw@db.example:5432/portal")

    assert database.get_database_url().startswith("postgresql+psycopg://")


def test_a_configuration_failure_never_reveals_the_password(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "mysql://user:hunter2@db.example/portal")

    with pytest.raises(DatabaseNotConfiguredError) as failure:
        database.get_database_url()

    assert "hunter2" not in str(failure.value)


def test_an_unreachable_database_fails_clearly_rather_than_silently(
    monkeypatch, restored_engine
):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:1/portal"
    )
    monkeypatch.setenv("DATABASE_POOL_SIZE", "1")
    database.dispose_engine()

    with pytest.raises(DatabaseUnavailableError) as failure:
        database.verify_connection()

    assert "unreachable" in str(failure.value)
    assert "postgres:postgres" not in str(failure.value)


def test_an_invalid_pool_size_is_a_configuration_error(monkeypatch, restored_engine):
    monkeypatch.setenv("DATABASE_POOL_SIZE", "not-a-number")
    database.dispose_engine()

    with pytest.raises(DatabaseNotConfiguredError):
        database.get_engine()
