"""Order and order-item persistence."""

from __future__ import annotations

from collections.abc import Iterable
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    ORDER_ID_SEQUENCE,
    ORDER_REFERENCE_SEQUENCE,
    OrderItemRecord,
    OrderRecord,
)
from app.errors import OrderNotFoundError
from app.models import Item, Order, OrderStatus, StoredOrder
from app.order_references import format_order_reference


def format_order_id(sequence_number: int) -> str:
    if sequence_number < 1:
        raise ValueError("Order id sequence numbers must be positive")
    return f"ORD-{sequence_number:03d}"


def _to_item(record: OrderItemRecord) -> Item:
    return Item(
        ItemCode=record.item_code,
        ItemReference=record.item_reference,
        Width=record.width,
        Length=record.length,
        Depth=record.depth,
        Weight=float(record.weight),
        BoxGroup=record.box_group,
        Quantity=record.quantity,
    )


def _to_stored_order(record: OrderRecord) -> StoredOrder:
    return StoredOrder(
        OrderId=record.order_id,
        Reference=record.reference,
        Status=record.status,
        CreatedAt=record.created_at.astimezone(timezone.utc),
        Items=[_to_item(item) for item in record.items],
    )


def _item_records(order_id: str, items: Iterable[Item]) -> list[OrderItemRecord]:
    return [
        OrderItemRecord(
            order_id=order_id,
            position=position,
            item_code=item.item_code,
            item_reference=item.item_reference,
            width=item.width,
            length=item.length,
            depth=item.depth,
            weight=item.weight,
            box_group=item.box_group,
            quantity=item.quantity,
        )
        for position, item in enumerate(items)
    ]


def next_order_identity(session: Session) -> tuple[int, str, str]:
    order_number = session.scalar(select(ORDER_ID_SEQUENCE.next_value()))
    reference_number = session.scalar(select(ORDER_REFERENCE_SEQUENCE.next_value()))
    return (
        order_number,
        format_order_id(order_number),
        format_order_reference(reference_number),
    )


def create_order(session: Session, order: Order) -> StoredOrder:
    order_number, order_id, reference = next_order_identity(session)
    record = OrderRecord(
        order_id=order_id,
        order_number=order_number,
        reference=reference,
        status="DRAFT",
        created_at=datetime.now(timezone.utc),
        items=_item_records(order_id, order.items),
    )
    session.add(record)
    session.flush()
    return _to_stored_order(record)


def find_record(session: Session, order_id: str) -> OrderRecord | None:
    return session.get(OrderRecord, order_id)


def lock_record(session: Session, order_id: str) -> OrderRecord:
    record = session.get(OrderRecord, order_id, with_for_update=True)
    if record is None:
        raise OrderNotFoundError(order_id)
    return record


def find_order(session: Session, order_id: str) -> StoredOrder | None:
    record = find_record(session, order_id)
    return _to_stored_order(record) if record else None


def list_orders(session: Session) -> list[StoredOrder]:
    records = session.scalars(
        select(OrderRecord).order_by(
            OrderRecord.created_at.desc(), OrderRecord.order_number.desc()
        )
    ).all()
    return [_to_stored_order(record) for record in records]


def replace_items(session: Session, record: OrderRecord, items: Iterable[Item]) -> None:
    """Flush deletions before reusing each unique item position."""
    record.items = []
    session.flush()
    record.items = _item_records(record.order_id, items)
    session.flush()


def set_status(session: Session, record: OrderRecord, status: OrderStatus) -> None:
    record.status = status


def write_order(session: Session, stored: StoredOrder) -> StoredOrder:
    record = lock_record(session, stored.order_id)
    record.status = stored.status
    replace_items(session, record, stored.items)
    session.flush()
    return _to_stored_order(record)


def order_to_api(record: OrderRecord) -> StoredOrder:
    return _to_stored_order(record)
