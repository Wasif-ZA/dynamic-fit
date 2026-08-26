"""Order API. POST assigns ORD-###; later calls use that id. Storage is app.store."""

from fastapi import APIRouter, HTTPException, status

from app import store
from app.models import Order, StoredOrder

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post(
    "",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an order",
)
def create_order(order: Order) -> StoredOrder:
    return store.save_order(order)


@router.get(
    "",
    response_model=list[StoredOrder],
    response_model_exclude_none=True,
    summary="List orders, newest first",
)
def list_orders() -> list[StoredOrder]:
    return store.list_orders()


def find_order(order_id: str) -> StoredOrder | None:
    return store.find_order(order_id)


@router.get(
    "/{order_id}",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Retrieve an order",
)
def get_order(order_id: str) -> StoredOrder:
    stored = store.find_order(order_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return stored
