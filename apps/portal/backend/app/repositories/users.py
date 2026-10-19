"""Portal user persistence."""

from __future__ import annotations

from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import PortalUserRecord
from app.errors import DuplicateUserError, UserNotFoundError
from app.models import PortalUser, Role, UserStatus


def _to_api(record: PortalUserRecord) -> PortalUser:
    return PortalUser(
        Id=record.id,
        AuthUserId=record.auth_user_id,
        Email=record.email,
        DisplayName=record.display_name,
        Role=record.role,
        Status=record.status,
        CreatedAt=record.created_at,
        UpdatedAt=record.updated_at,
    )


def list_users(session: Session) -> list[PortalUser]:
    records = session.scalars(
        select(PortalUserRecord).order_by(
            PortalUserRecord.created_at, PortalUserRecord.id
        )
    ).all()
    return [_to_api(record) for record in records]


def find_by_auth_user_id(session: Session, auth_user_id: UUID) -> PortalUser | None:
    record = session.scalar(
        select(PortalUserRecord).where(
            PortalUserRecord.auth_user_id == auth_user_id
        )
    )
    return _to_api(record) if record else None


def find_by_email(session: Session, email: str) -> PortalUser | None:
    record = session.scalar(
        select(PortalUserRecord).where(
            func.lower(PortalUserRecord.email) == email.lower()
        )
    )
    return _to_api(record) if record else None


def lock_user(session: Session, user_id: UUID) -> PortalUserRecord:
    record = session.get(PortalUserRecord, user_id, with_for_update=True)
    if record is None:
        raise UserNotFoundError(str(user_id))
    return record


def lock_user_by_auth_user_id(
    session: Session, auth_user_id: UUID
) -> PortalUserRecord:
    record = session.scalar(
        select(PortalUserRecord)
        .where(PortalUserRecord.auth_user_id == auth_user_id)
        .with_for_update()
    )
    if record is None:
        raise UserNotFoundError(str(auth_user_id))
    return record


def create_user(
    session: Session,
    *,
    auth_user_id: UUID,
    email: str,
    display_name: str | None,
    role: Role,
) -> PortalUser:
    record = PortalUserRecord(
        id=uuid4(),
        auth_user_id=auth_user_id,
        email=email.lower(),
        display_name=display_name,
        role=role.value,
        status=UserStatus.ACTIVE.value,
    )
    session.add(record)
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateUserError(email) from exc
    return _to_api(record)


def update_user(
    session: Session,
    record: PortalUserRecord,
    *,
    display_name: str | None,
    role: Role,
) -> PortalUser:
    record.display_name = display_name
    record.role = role.value
    record.updated_at = func.now()
    session.flush()
    return _to_api(record)


def set_status(
    session: Session, record: PortalUserRecord, status: UserStatus
) -> PortalUser:
    record.status = status.value
    record.updated_at = func.now()
    session.flush()
    return _to_api(record)


def delete_user(session: Session, record: PortalUserRecord) -> None:
    session.delete(record)
    session.flush()


def count_active_administrators(session: Session) -> int:
    return session.scalar(
        select(func.count())
        .select_from(PortalUserRecord)
        .where(
            PortalUserRecord.role == Role.ADMINISTRATOR.value,
            PortalUserRecord.status == UserStatus.ACTIVE.value,
        )
    )


def lock_active_administrators(session: Session) -> list[PortalUserRecord]:
    return list(
        session.scalars(
            select(PortalUserRecord)
            .where(
                PortalUserRecord.role == Role.ADMINISTRATOR.value,
                PortalUserRecord.status == UserStatus.ACTIVE.value,
            )
            .order_by(PortalUserRecord.id)
            .with_for_update()
        ).all()
    )
