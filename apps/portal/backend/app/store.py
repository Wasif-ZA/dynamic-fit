"""Order and solution domain API."""

from __future__ import annotations

from sqlalchemy import text

from app.database import session_scope
from app.errors import OrderNotFoundError, OrderStatusConflictError
from app.models import Item, Order, StoredOrder
from app.repositories import orders as order_repository
from app.repositories import solutions as solution_repository

FINAL_IS_READ_ONLY = "Final orders are read-only and cannot be edited"
ONLY_DRAFTS_CAN_BE_SUBMITTED = (
    "Only draft orders can be submitted for optimisation"
)
ONLY_SOLVABLE_ORDERS_CAN_BE_OPTIMISED = (
    "Only orders awaiting optimisation or already optimised can be solved"
)

_SOLVABLE_STATES = frozenset({"AWAITING_OPTIMISATION", "OPTIMISED"})


def save_order(order: Order) -> StoredOrder:
    with session_scope() as session:
        return order_repository.create_order(session, order)


def find_order(order_id: str) -> StoredOrder | None:
    with session_scope() as session:
        return order_repository.find_order(session, order_id)


def list_orders() -> list[StoredOrder]:
    """Newest first."""
    with session_scope() as session:
        return order_repository.list_orders(session)


def update_order(stored: StoredOrder) -> StoredOrder:
    with session_scope() as session:
        return order_repository.write_order(session, stored)


def submit_order(order_id: str) -> StoredOrder:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status != "DRAFT":
            raise OrderStatusConflictError(ONLY_DRAFTS_CAN_BE_SUBMITTED)
        order_repository.set_status(session, record, "AWAITING_OPTIMISATION")
        session.flush()
        return order_repository.order_to_api(record)


def replace_order_items(order_id: str, items: list[Item]) -> StoredOrder:
    """Replace items, reset to DRAFT, and discard the solution atomically."""
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status == "FINAL":
            raise OrderStatusConflictError(FINAL_IS_READ_ONLY)

        order_repository.replace_items(session, record, items)
        order_repository.set_status(session, record, "DRAFT")
        session.flush()

        solution_repository.invalidate_solution(session, order_id)
        session.flush()
        return order_repository.order_to_api(record)


def save_solution(order_id: str, document: dict) -> dict:
    """Replace any previous solution for this order."""
    with session_scope() as session:
        return solution_repository.save_solution(session, order_id, document)


def save_solution_for_optimised_order(order_id: str, document: dict) -> dict:
    """Save the solution and mark the locked order OPTIMISED atomically."""
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status not in _SOLVABLE_STATES:
            raise OrderStatusConflictError(ONLY_SOLVABLE_ORDERS_CAN_BE_OPTIMISED)

        solution_repository.save_solution(session, order_id, document)
        order_repository.set_status(session, record, "OPTIMISED")
        session.flush()
        return document


def find_solution(order_id: str) -> dict | None:
    with session_scope() as session:
        return solution_repository.find_solution(session, order_id)


def reset() -> None:
    """Reset persistent state and identity sequences for tests."""
    with session_scope() as session:
        session.execute(
            text(
                "TRUNCATE TABLE solutions, order_items, orders, box_types "
                "RESTART IDENTITY CASCADE"
            )
        )
        session.execute(text("ALTER SEQUENCE order_id_sequence RESTART WITH 1"))
        session.execute(text("ALTER SEQUENCE order_reference_sequence RESTART WITH 1"))


__all__ = [
    "OrderNotFoundError",
    "OrderStatusConflictError",
    "find_order",
    "find_solution",
    "list_orders",
    "replace_order_items",
    "reset",
    "save_order",
    "save_solution",
    "save_solution_for_optimised_order",
    "submit_order",
    "update_order",
]
