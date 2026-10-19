"""Authenticated Portal profiles and user management."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import user_management
from app.auth import get_current_user, require_user_manager
from app.auth_admin import SupabaseAuthAdmin, get_auth_admin
from app.errors import (
    AuthAdminError,
    DuplicateUserError,
    UserManagementConflictError,
    UserNotFoundError,
)
from app.models import PortalUser, UserCreate, UserStatus, UserUpdate

router = APIRouter(tags=["users"])


def _translate(error: Exception) -> HTTPException:
    if isinstance(error, UserNotFoundError):
        return HTTPException(status_code=404, detail="Portal user not found")
    if isinstance(error, DuplicateUserError):
        return HTTPException(status_code=409, detail="A user with this email already exists")
    if isinstance(error, UserManagementConflictError):
        return HTTPException(status_code=409, detail=str(error))
    if isinstance(error, AuthAdminError):
        return HTTPException(status_code=502, detail=str(error))
    return HTTPException(status_code=500, detail="User management failed")


@router.get("/auth/me", response_model=PortalUser)
def current_profile(
    user: Annotated[PortalUser, Depends(get_current_user)],
) -> PortalUser:
    return user


@router.get("/users", response_model=list[PortalUser])
def list_users(
    _actor: Annotated[PortalUser, Depends(require_user_manager)],
) -> list[PortalUser]:
    return user_management.list_users()


@router.post("/users", response_model=PortalUser, status_code=status.HTTP_201_CREATED)
def create_user(
    request: UserCreate,
    actor: Annotated[PortalUser, Depends(require_user_manager)],
    auth_admin: Annotated[SupabaseAuthAdmin, Depends(get_auth_admin)],
) -> PortalUser:
    try:
        return user_management.create_user(actor, request, auth_admin)
    except Exception as exc:
        raise _translate(exc) from exc


@router.put("/users/{user_id}", response_model=PortalUser)
def update_user(
    user_id: UUID,
    request: UserUpdate,
    actor: Annotated[PortalUser, Depends(require_user_manager)],
) -> PortalUser:
    try:
        return user_management.update_user(actor, user_id, request)
    except Exception as exc:
        raise _translate(exc) from exc


@router.post("/users/{user_id}/disable", response_model=PortalUser)
def disable_user(
    user_id: UUID,
    actor: Annotated[PortalUser, Depends(require_user_manager)],
) -> PortalUser:
    try:
        return user_management.set_user_status(actor, user_id, UserStatus.DISABLED)
    except Exception as exc:
        raise _translate(exc) from exc


@router.post("/users/{user_id}/enable", response_model=PortalUser)
def enable_user(
    user_id: UUID,
    actor: Annotated[PortalUser, Depends(require_user_manager)],
) -> PortalUser:
    try:
        return user_management.set_user_status(actor, user_id, UserStatus.ACTIVE)
    except Exception as exc:
        raise _translate(exc) from exc


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    actor: Annotated[PortalUser, Depends(require_user_manager)],
    auth_admin: Annotated[SupabaseAuthAdmin, Depends(get_auth_admin)],
) -> Response:
    try:
        user_management.delete_user(actor, user_id, auth_admin)
    except Exception as exc:
        raise _translate(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
