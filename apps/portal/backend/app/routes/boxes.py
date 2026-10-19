"""Deployment-wide Box Inventory API."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import boxes
from app.auth import (
    get_current_user,
    require_inventory_manager,
)
from app.models import BoxImportRequest, BoxImportResponse, BoxType, BoxTypeUpdate, PortalUser

router = APIRouter(prefix="/boxes", tags=["boxes"])


def require_box_type(reference: str) -> BoxType:
    box = boxes.find_box_type(reference)
    if box is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Box type not found",
        )
    return box


@router.get("", response_model=list[BoxType], summary="List all box inventory")
def list_box_types(
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> list[BoxType]:
    return boxes.list_box_types()


@router.get(
    "/{reference}", response_model=BoxType, summary="Retrieve a box inventory record"
)
def get_box_type(
    reference: str,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> BoxType:
    return require_box_type(reference)


@router.post(
    "",
    response_model=BoxType,
    status_code=status.HTTP_201_CREATED,
    summary="Add a box type",
)
def create_box_type(
    box: BoxType,
    _user: Annotated[PortalUser, Depends(require_inventory_manager)],
) -> BoxType:
    try:
        return boxes.add_box_type(box)
    except boxes.DuplicateBoxReferenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A box type with this Reference already exists",
        ) from exc


@router.post(
    "/import",
    response_model=BoxImportResponse,
    summary="Atomically apply reviewed Box Inventory results",
)
def import_box_types(
    request: BoxImportRequest,
    _user: Annotated[PortalUser, Depends(require_inventory_manager)],
) -> BoxImportResponse:
    try:
        imported = boxes.import_box_types(request.boxes)
    except boxes.DuplicateImportReferenceError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate box Reference values are not allowed in an import",
        ) from exc
    return BoxImportResponse(Imported=len(imported), Boxes=imported)


@router.put(
    "/{reference}",
    response_model=BoxType,
    summary="Replace a box type's editable inventory fields",
)
def update_box_type(
    reference: str,
    changes: BoxTypeUpdate,
    _user: Annotated[PortalUser, Depends(require_inventory_manager)],
) -> BoxType:
    updated = boxes.update_box_type(reference, changes)
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Box type not found",
        )
    return updated


@router.delete(
    "/{reference}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete a box type",
)
def delete_box_type(
    reference: str,
    _user: Annotated[PortalUser, Depends(require_inventory_manager)],
) -> Response:
    if not boxes.delete_box_type(reference):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Box type not found",
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
