"""Order API.

Orders are currently stored in memory. Persistent storage will be implemented
with Supabase under Ticket #30. Until then, order data is lost and the order
reference sequence resets when the application restarts.
"""

from fastapi import APIRouter, HTTPException, status

from app.models import Order, StoredOrder

router = APIRouter(prefix="/orders", tags=["orders"])

# TODO(#30): Replace this in-memory store with Supabase persistence.
# Supabase must persist orders and their associated items so they survive
# backend restarts. Keep the existing POST /orders and GET /orders/{order_id}
# API contract unchanged.
_orders: dict[str, StoredOrder] = {}

# TODO(#30): Remove this process-local counter when Supabase persistence is
# added. PostgreSQL should generate the order's numeric primary key, and
# FastAPI should expose that ID using the existing ORD-001, ORD-002, ... format.
# The current counter restarts with the backend, so it cannot remain once orders
# outlive a restart.
_next_order_number = 1


def _next_order_id() -> str:
    """Generate the next temporary in-memory order reference.

    TODO(#30): Remove this helper once Supabase provides the numeric order ID.
    FastAPI should format the database ID as `ORD-###`.
    """
    global _next_order_number

    order_id = f"ORD-{_next_order_number:03d}"
    _next_order_number += 1
    return order_id


@router.post(
    "",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    status_code=status.HTTP_201_CREATED,
    summary="Create an order",
)
def create_order(order: Order) -> StoredOrder:
    stored = StoredOrder(order_id=_next_order_id(), items=order.items)
    # TODO(#30): Persist this order in Supabase instead of `_orders`.
    # PostgreSQL should generate the numeric order ID, and associated Items must be
    # stored against that order, and FastAPI should expose the ID as `ORD-###`.
    _orders[stored.order_id] = stored
    return stored


def find_order(order_id: str) -> StoredOrder | None:
    """Look up an order without going through the HTTP layer.

    The solve routes need the stored order, and reaching into a private dict from
    another module would break the moment #30 swaps it for Supabase.
    """
    return _orders.get(order_id)


@router.get(
    "/{order_id}",
    response_model=StoredOrder,
    response_model_exclude_none=True,
    summary="Retrieve an order",
)
def get_order(order_id: str) -> StoredOrder:
    # TODO(#30): Validate and parse the public `ORD-###` reference before
    # querying Supabase. Malformed references should be rejected before lookup.
    # Valid references should be converted to the numeric database ID, then the
    # order and associated Items should be retrieved. Return 404 only when a
    # valid reference has no matching order, and preserve the StoredOrder
    # response shape.
    stored = _orders.get(order_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return stored
