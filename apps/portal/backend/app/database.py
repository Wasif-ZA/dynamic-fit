"""Database engine and session lifecycle."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
import logging
import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker

logger = logging.getLogger(__name__)

DATABASE_URL_VARIABLE = "DATABASE_URL"
POOL_SIZE_VARIABLE = "DATABASE_POOL_SIZE"
MAX_OVERFLOW_VARIABLE = "DATABASE_MAX_OVERFLOW"

DEFAULT_POOL_SIZE = 5
DEFAULT_MAX_OVERFLOW = 5

_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


class DatabaseNotConfiguredError(RuntimeError):
    pass


class DatabaseUnavailableError(RuntimeError):
    pass


def _load_env_file() -> None:
    if not _ENV_FILE.is_file():
        return
    try:
        from dotenv import load_dotenv
    except ImportError:  # pragma: no cover - python-dotenv is a listed dependency
        return
    load_dotenv(_ENV_FILE, override=False)


def _normalised_url(raw: str) -> str:
    url = make_url(raw)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if not url.drivername.startswith("postgresql"):
        raise DatabaseNotConfiguredError(
            f"{DATABASE_URL_VARIABLE} must be a PostgreSQL URL, "
            f"got driver {url.drivername!r}"
        )
    return url.render_as_string(hide_password=False)


def get_database_url() -> str:
    _load_env_file()
    raw = os.getenv(DATABASE_URL_VARIABLE, "").strip()
    if not raw:
        raise DatabaseNotConfiguredError(
            f"{DATABASE_URL_VARIABLE} is not set. Point it at the Portal's "
            "PostgreSQL database (see backend/.env.example)."
        )
    try:
        return _normalised_url(raw)
    except DatabaseNotConfiguredError:
        raise
    except Exception as exc:  # noqa: BLE001 - surfaced as configuration failure
        # Never echo the URL itself; it carries the database password.
        raise DatabaseNotConfiguredError(
            f"{DATABASE_URL_VARIABLE} is not a valid database URL"
        ) from exc


def _positive_int(variable: str, default: int) -> int:
    raw = os.getenv(variable, "").strip()
    if not raw:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise DatabaseNotConfiguredError(
            f"{variable} must be an integer, got {raw!r}"
        ) from exc
    if value < 0:
        raise DatabaseNotConfiguredError(f"{variable} must not be negative")
    return value


def get_engine() -> Engine:
    global _engine

    if _engine is None:
        _engine = create_engine(
            get_database_url(),
            pool_pre_ping=True,
            pool_size=_positive_int(POOL_SIZE_VARIABLE, DEFAULT_POOL_SIZE),
            max_overflow=_positive_int(MAX_OVERFLOW_VARIABLE, DEFAULT_MAX_OVERFLOW),
            future=True,
        )
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    global _session_factory

    if _session_factory is None:
        _session_factory = sessionmaker(
            bind=get_engine(), expire_on_commit=False, future=True
        )
    return _session_factory


def dispose_engine() -> None:
    global _engine, _session_factory

    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None


@contextmanager
def session_scope() -> Iterator[Session]:
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def verify_connection() -> None:
    try:
        with get_engine().connect() as connection:
            connection.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        # The URL (and therefore the password) is deliberately kept out of logs.
        logger.error("Portal database is unreachable: %s", type(exc).__name__)
        raise DatabaseUnavailableError(
            "The Portal database is unreachable. Check that PostgreSQL is "
            f"running and that {DATABASE_URL_VARIABLE} is correct."
        ) from exc
