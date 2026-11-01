"""Order API. POST assigns OrderId and Reference; routes continue using OrderId."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import boxes, finalisation, store
from app.auth import get_current_user, require_finalisation_user, require_order_manager
from app.errors import (
    InventoryConsumptionError,
    ItemWeightLimitError,
    OrderNotFoundError,
    OrderStatusConflictError,
    SolutionHasRejectsError,
    SolutionNotFoundError,
)
from app.models import Order, OrderView, PortalUser, StoredOrder
from app.item_weights import maximum_item_weight_kg

router = APIRouter(prefix="/orders", tags=["orders"])

ORDER_NOT_FOUND = "Order not found"
ACTIVE_SOLUTION_NOT_FOUND = "The active optimisation solution could not be found"


def _not_found() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND, detail=ORDER_NOT_FOUND
    )


def _conflict(detail: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


@router.post(
    "",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an order",
)
def create_order(
    order: Order,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> StoredOrder:
    try:
        return store.save_order(order)
    except ItemWeightLimitError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc


def require_order(order_id: str) -> StoredOrder:
    stored = store.find_order(order_id)
    if stored is None:
        raise _not_found()
    return stored


@router.post(
    "/{order_id}/submit",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Submit a draft order for optimisation",
)
def submit_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> StoredOrder:
    try:
        return store.submit_order(order_id)
    except ItemWeightLimitError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc


@router.put(
    "/{order_id}",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Replace an order's items",
)
def update_order(
    order_id: str,
    order: Order,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> StoredOrder:
    try:
        return store.replace_order_items(order_id, order.items)
    except ItemWeightLimitError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc


@router.post(
    "/{order_id}/finalise",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Approve the active solution and consume its box inventory",
)
def finalise_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_finalisation_user)],
) -> StoredOrder:
    try:
        return finalisation.finalise_order(order_id)
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc
    except SolutionNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ACTIVE_SOLUTION_NOT_FOUND,
        ) from exc
    except SolutionHasRejectsError as exc:
        raise _conflict(
            "This order cannot be finalised because "
            f"{exc.reject_count} item(s) were not packed. Resolve the packing errors "
            "and re-optimise before finalising."
        ) from exc
    except InventoryConsumptionError as exc:
        raise _conflict(
            f"Cannot finalise this order. {' '.join(exc.issues)}"
        ) from exc


@router.get(
    "",
    response_model=list[StoredOrder],
    response_model_exclude_none=True,
    summary="List orders, newest first",
)
def list_orders(
    _user: Annotated[PortalUser, Depends(get_current_user)],
    view: OrderView = "active",
) -> list[StoredOrder]:
    return store.list_orders(view=view)


@router.post(
    "/{order_id}/archive", response_model=StoredOrder, response_model_exclude_none=True,
    summary="Archive a finalised order early",
)
def archive_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_order_manager)],
) -> StoredOrder:
    try:
        return store.archive_order(order_id)
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc


@router.post(
    "/{order_id}/hold", response_model=StoredOrder, response_model_exclude_none=True,
    summary="Put an unfinished order on hold in the backlog",
)
def hold_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_order_manager)],
) -> StoredOrder:
    try:
        return store.hold_order(order_id)
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc


@router.post(
    "/{order_id}/resume", response_model=StoredOrder, response_model_exclude_none=True,
    summary="Resume an unfinished order from the backlog",
)
def resume_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_order_manager)],
) -> StoredOrder:
    try:
        return store.resume_order(order_id)
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc


@router.delete(
    "/{order_id}", status_code=status.HTTP_204_NO_CONTENT,
    summary="Permanently delete an unfinished active or on-hold order",
)
def delete_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_order_manager)],
) -> Response:
    try:
        store.delete_order(order_id)
    except OrderNotFoundError as exc:
        raise _not_found() from exc
    except OrderStatusConflictError as exc:
        raise _conflict(exc.detail) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/item-weight-limit", summary="Current item weight capacity of available active boxes")
def item_weight_limit(
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> dict:
    available = boxes.active_box_types()
    return {
        "MaxItemWeightKg": maximum_item_weight_kg(available),
        "HasAvailableBoxes": bool(available),
    }


@router.get(
    "/{order_id}",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Retrieve an order",
)
def get_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> StoredOrder:
    return require_order(order_id)
