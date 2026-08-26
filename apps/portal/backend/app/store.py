"""In-memory orders and solutions. TODO(#30): swap the bodies for Supabase."""

from __future__ import annotations

from app.models import Order, StoredOrder

_orders: dict[str, StoredOrder] = {}
_solutions: dict[str, dict] = {}
_next_order_number = 1


def save_order(order: Order) -> StoredOrder:
    """Mint ORD-### and store the order under it."""
    global _next_order_number

    stored = StoredOrder(
        order_id=f"ORD-{_next_order_number:03d}",
        reference=order.reference,
        items=order.items,
    )
    _next_order_number += 1
    _orders[stored.order_id] = stored
    return stored


def find_order(order_id: str) -> StoredOrder | None:
    return _orders.get(order_id)


def list_orders() -> list[StoredOrder]:
    """Newest first."""
    return list(reversed(_orders.values()))


def update_order(stored: StoredOrder) -> StoredOrder:
    _orders[stored.order_id] = stored
    return stored


def save_solution(order_id: str, document: dict) -> dict:
    """Replace any previous solution for this order."""
    _solutions[order_id] = document
    return document


def find_solution(order_id: str) -> dict | None:
    return _solutions.get(order_id)


def reset() -> None:
    """Clear store. Tests start again at ORD-001."""
    global _next_order_number

    _orders.clear()
    _solutions.clear()
    _next_order_number = 1
