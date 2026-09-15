"""Portal account provisioning and role hierarchy."""

from __future__ import annotations

import logging
from uuid import UUID

from app.auth_admin import SupabaseAuthAdmin
from app.database import session_scope
from app.errors import (
    AuthAdminError,
    DuplicateAuthUserError,
    DuplicateUserError,
    UserManagementConflictError,
)
from app.models import PortalUser, Role, UserCreate, UserStatus, UserUpdate
from app.repositories import users as user_repository

logger = logging.getLogger(__name__)


def list_users() -> list[PortalUser]:
    with session_scope() as session:
        return user_repository.list_users(session)


def create_user(
    actor: PortalUser, request: UserCreate, auth_admin: SupabaseAuthAdmin
) -> PortalUser:
    _allow_created_role(actor, request.role)
    with session_scope() as session:
        if user_repository.find_by_email(session, request.email):
            raise DuplicateUserError(request.email)

    auth_user_id = auth_admin.find_user_by_email(request.email)
    created_auth = False
    if auth_user_id is None:
        try:
            auth_user_id = auth_admin.create_user(request.email, request.password)
            created_auth = True
        except DuplicateAuthUserError:
            auth_user_id = auth_admin.find_user_by_email(request.email)
            if auth_user_id is None:
                raise DuplicateUserError(request.email) from None
        except AuthAdminError as create_error:
            try:
                auth_user_id = auth_admin.find_user_by_email(request.email)
            except AuthAdminError:
                raise create_error
            if auth_user_id is None:
                raise create_error
    try:
        with session_scope() as session:
            return user_repository.create_user(
                session,
                auth_user_id=auth_user_id,
                email=request.email,
                display_name=request.display_name,
                role=request.role,
            )
    except Exception as portal_error:
        try:
            identity_has_profile = _auth_identity_has_profile(auth_user_id)
        except Exception:
            logger.exception(
                "Could not verify Portal profile after provisioning failure for %s",
                auth_user_id,
            )
            raise portal_error
        if created_auth and not identity_has_profile:
            try:
                auth_admin.delete_user(auth_user_id)
            except AuthAdminError as cleanup_error:
                raise AuthAdminError(
                    "Portal account creation failed and the Supabase identity cleanup must be retried"
                ) from cleanup_error
        raise portal_error


def _auth_identity_has_profile(auth_user_id: UUID) -> bool:
    with session_scope() as session:
        return user_repository.find_by_auth_user_id(session, auth_user_id) is not None


def update_user(
    actor: PortalUser, user_id: UUID, request: UserUpdate
) -> PortalUser:
    with session_scope() as session:
        record, active_administrators = _lock_management_target(session, user_id)
        current_role = Role(record.role)
        _allow_target(actor, record.id, current_role)
        _allow_new_role(actor, current_role, request.role)
        _protect_last_administrator(
            record_role=Role(record.role),
            record_status=UserStatus(record.status),
            next_role=request.role,
            next_status=UserStatus(record.status),
            active_administrators=active_administrators,
        )
        return user_repository.update_user(
            session,
            record,
            display_name=request.display_name,
            role=request.role,
        )


def set_user_status(
    actor: PortalUser, user_id: UUID, next_status: UserStatus
) -> PortalUser:
    with session_scope() as session:
        record, active_administrators = _lock_management_target(session, user_id)
        role = Role(record.role)
        _allow_target(actor, record.id, role)
        _protect_last_administrator(
            record_role=role,
            record_status=UserStatus(record.status),
            next_role=role,
            next_status=next_status,
            active_administrators=active_administrators,
        )
        return user_repository.set_status(session, record, next_status)


def delete_user(
    actor: PortalUser, user_id: UUID, auth_admin: SupabaseAuthAdmin
) -> None:
    with session_scope() as session:
        record, active_administrators = _lock_management_target(session, user_id)
        role = Role(record.role)
        _allow_target(actor, record.id, role)
        _protect_last_administrator(
            record_role=role,
            record_status=UserStatus(record.status),
            next_role=role,
            next_status=UserStatus.DISABLED,
            active_administrators=active_administrators,
        )
        auth_user_id = record.auth_user_id
        email = record.email
        user_repository.delete_user(session, record)
    try:
        auth_admin.delete_user(auth_user_id)
    except AuthAdminError:
        logger.exception(
            "Portal profile deleted but Supabase Auth cleanup must be retried for %s (%s)",
            auth_user_id,
            email,
        )
        raise


def _lock_management_target(session, user_id: UUID):
    active_administrators = user_repository.lock_active_administrators(session)
    record = next(
        (administrator for administrator in active_administrators if administrator.id == user_id),
        None,
    )
    if record is None:
        record = user_repository.lock_user(session, user_id)
    return record, len(active_administrators)


def _allow_created_role(actor: PortalUser, role: Role) -> None:
    if role == Role.ADMINISTRATOR:
        raise UserManagementConflictError(
            "Administrator accounts must be created through the bootstrap process"
        )
    if actor.role == Role.SUPERVISOR and role != Role.USER:
        raise UserManagementConflictError("Supervisors may create only USER accounts")


def _allow_target(actor: PortalUser, target_id: UUID, target_role: Role) -> None:
    if actor.role == Role.SUPERVISOR and target_role != Role.USER:
        raise UserManagementConflictError(
            "Supervisors may manage only USER accounts"
        )
    if target_role == Role.ADMINISTRATOR and actor.id != target_id:
        raise UserManagementConflictError(
            "Administrators may not modify another Administrator account"
        )


def _allow_new_role(actor: PortalUser, current_role: Role, next_role: Role) -> None:
    if actor.role == Role.SUPERVISOR and next_role != Role.USER:
        raise UserManagementConflictError(
            "Supervisors may not promote accounts"
        )
    if next_role == Role.ADMINISTRATOR and current_role != Role.ADMINISTRATOR:
        raise UserManagementConflictError(
            "Administrator promotion is available only through bootstrap"
        )


def _protect_last_administrator(
    *,
    record_role: Role,
    record_status: UserStatus,
    next_role: Role,
    next_status: UserStatus,
    active_administrators: int,
) -> None:
    removes_active_admin = (
        record_role == Role.ADMINISTRATOR
        and record_status == UserStatus.ACTIVE
        and (
            next_role != Role.ADMINISTRATOR
            or next_status != UserStatus.ACTIVE
        )
    )
    if not removes_active_admin:
        return
    if active_administrators <= 1:
        raise UserManagementConflictError(
            "The final active Administrator cannot be disabled, deleted or demoted"
        )
