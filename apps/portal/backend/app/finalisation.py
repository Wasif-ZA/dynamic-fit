"""Order finalisation and inventory consumption."""

from __future__ import annotations

from app.database import session_scope
from app.errors import (
    OrderStatusConflictError,
    SolutionHasRejectsError,
    SolutionNotFoundError,
)
from app.inventory import required_cartons
from app.models import StoredOrder
from app.repositories import boxes as box_repository
from app.repositories import orders as order_repository
from app.repositories import solutions as solution_repository

ONLY_OPTIMISED_ORDERS_CAN_BE_FINALISED = "Only optimised orders can be finalised"


def finalise_order(order_id: str) -> StoredOrder:
    """Deduct stock and set FINAL atomically."""
    with session_scope() as session:
        record = order_repository.lock_record(session, order_id)
        if record.status != "OPTIMISED":
            raise OrderStatusConflictError(ONLY_OPTIMISED_ORDERS_CAN_BE_FINALISED)

        solution = solution_repository.find_solution(session, order_id)
        if solution is None:
            raise SolutionNotFoundError(order_id)

        reject_count = len(solution.get("rejects", []))
        if reject_count:
            raise SolutionHasRejectsError(reject_count)

        box_repository.consume_box_stock(session, required_cartons(solution))

        order_repository.set_status(session, record, "FINAL")
        session.flush()
        return order_repository.order_to_api(record)
