"""Manual handling warnings are advisory and independent of packing capacity."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.auth import get_current_user, require_roles
from app.database import session_scope
from app.models import ManualHandlingSettings, PortalUser, Role
from app.repositories import settings as repository

router = APIRouter(prefix="/settings", tags=["settings"])
require_handling_manager = require_roles(Role.SUPERVISOR, Role.ADMINISTRATOR)


@router.get("/manual-handling", response_model=ManualHandlingSettings)
def get_manual_handling(
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> ManualHandlingSettings:
    with session_scope() as session:
        return repository.get_manual_handling(session)


@router.put("/manual-handling", response_model=ManualHandlingSettings)
def update_manual_handling(
    settings: ManualHandlingSettings,
    _user: Annotated[PortalUser, Depends(require_handling_manager)],
) -> ManualHandlingSettings:
    with session_scope() as session:
        return repository.set_manual_handling(session, settings)
