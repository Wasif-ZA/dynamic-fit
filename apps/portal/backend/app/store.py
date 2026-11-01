"""Order and solution domain API."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import text

from app.database import session_scope
from app.errors import ARCHIVED_ORDER_IS_READ_ONLY, HELD_ORDER_IS_READ_ONLY, OrderNotFoundError, OrderStatusConflictError
from app.models import Item, Order, OrderView, StoredOrder
from app.item_weights import validate_item_weights
from app.repositories import boxes as box_repository
from app.repositories import orders as order_repository
from app.repositories import solutions as solution_repository

FINAL_IS_READ_ONLY = "Final orders are read-only and cannot be edited"
ONLY_DRAFTS_CAN_BE_SUBMITTED = (
    "Only draft orders can be submitted for optimisation"
)
ONLY_SOLVABLE_ORDERS_CAN_BE_OPTIMISED = (
    "Only draft, awaiting optimisation or optimised orders can be solved"
)

SOLVABLE_ORDER_STATUSES = frozenset({"DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED"})


def save_order(order: Order) -> StoredOrder:
    with session_scope() as session:
        validate_item_weights(order.items, box_repository.active_box_types(session))
        return order_repository.create_order(session, order)


def find_order(order_id: str) -> StoredOrder | None:
    with session_scope() as session:
        return order_repository.find_order(session, order_id)


def list_orders(*, view: OrderView = "active") -> list[StoredOrder]:
    """Active orders, paused backlog, or finalised archive, newest first."""
    with session_scope() as session:
        return order_repository.list_orders(session, view=view)


def archive_order(order_id: str) -> StoredOrder:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status != "FINAL":
            raise OrderStatusConflictError("Only finalised orders can be archived. Put unfinished orders on hold instead.")
        order_repository.set_archived(session, record)
        return order_repository.find_order(session, order_id)


def hold_order(order_id: str) -> StoredOrder:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status == "FINAL":
            raise OrderStatusConflictError("Finalised orders cannot be put on hold")
        order_repository.set_held(session, record, True)
        return order_repository.find_order(session, order_id)


def resume_order(order_id: str) -> StoredOrder:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status == "FINAL":
            raise OrderStatusConflictError("Finalised orders cannot be resumed")
        order_repository.set_held(session, record, False)
        return order_repository.find_order(session, order_id)


def archive_due_orders(*, now: datetime | None = None) -> int:
    with session_scope() as session:
        return order_repository.archive_due_orders(session, now or datetime.now(timezone.utc))


def delete_order(order_id: str) -> None:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status == "FINAL":
            raise OrderStatusConflictError("Finalised orders cannot be permanently deleted")
        order_repository.delete_order(session, record)


def update_order(stored: StoredOrder) -> StoredOrder:
    with session_scope() as session:
        return order_repository.write_order(session, stored)


def submit_order(order_id: str) -> StoredOrder:
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.held_at is not None:
            raise OrderStatusConflictError(HELD_ORDER_IS_READ_ONLY)
        if record.archived_at is not None:
            raise OrderStatusConflictError(ARCHIVED_ORDER_IS_READ_ONLY)
        if record.status != "DRAFT":
            raise OrderStatusConflictError(ONLY_DRAFTS_CAN_BE_SUBMITTED)
        validate_item_weights(order_repository.order_to_api(record).items, box_repository.active_box_types(session))
        order_repository.set_status(session, record, "AWAITING_OPTIMISATION")
        session.flush()
        return order_repository.order_to_api(record)


def replace_order_items(order_id: str, items: list[Item]) -> StoredOrder:
    """Replace items, reset to DRAFT, and discard the solution atomically."""
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.held_at is not None:
            raise OrderStatusConflictError(HELD_ORDER_IS_READ_ONLY)
        if record.archived_at is not None:
            raise OrderStatusConflictError(ARCHIVED_ORDER_IS_READ_ONLY)
        if record.status == "FINAL":
            raise OrderStatusConflictError(FINAL_IS_READ_ONLY)

        validate_item_weights(items, box_repository.active_box_types(session))

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


def save_solution_for_optimised_order(
    order_id: str, document: dict, *, expected_items: list[Item]
) -> dict:
    """Save the solution and mark the locked order OPTIMISED atomically."""
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.held_at is not None:
            raise OrderStatusConflictError(HELD_ORDER_IS_READ_ONLY)
        if record.archived_at is not None:
            raise OrderStatusConflictError(ARCHIVED_ORDER_IS_READ_ONLY)
        if record.status not in SOLVABLE_ORDER_STATUSES:
            raise OrderStatusConflictError(ONLY_SOLVABLE_ORDERS_CAN_BE_OPTIMISED)
        if order_repository.order_to_api(record).items != expected_items:
            raise OrderStatusConflictError(
                "This order was edited during optimisation. Run optimisation again "
                "using the current items."
            )

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
    "archive_order",
    "hold_order",
    "resume_order",
    "archive_due_orders",
    "delete_order",
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
