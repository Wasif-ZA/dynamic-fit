"""Deployment-wide Box Inventory persistence."""

from __future__ import annotations

from collections.abc import Iterable, Mapping

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import inventory
from app.db.models import BoxTypeRecord
from app.errors import (
    DuplicateBoxReferenceError,
    DuplicateImportReferenceError,
    InventoryConsumptionError,
)
from app.models import BoxType, BoxTypeUpdate, InventoryFeasibility

# Excluding sort_key keeps existing references in their listing position.
_EDITABLE_COLUMNS = (
    "width",
    "length",
    "depth",
    "max_weight",
    "box_weight",
    "active",
    "maximum_boxes",
)


def _to_box_type(record: BoxTypeRecord) -> BoxType:
    return BoxType(
        Reference=record.reference,
        Width=float(record.width),
        Length=float(record.length),
        Depth=float(record.depth),
        MaxWeight=None if record.max_weight is None else float(record.max_weight),
        BoxWeight=None if record.box_weight is None else float(record.box_weight),
        Active=record.active,
        MaximumBoxes=record.maximum_boxes,
    )


def _column_values(box: BoxType) -> dict:
    return {
        "width": box.width,
        "length": box.length,
        "depth": box.depth,
        "max_weight": box.max_weight,
        "box_weight": box.box_weight,
        "active": box.active,
        "maximum_boxes": box.maximum_boxes,
    }


def list_box_types(session: Session) -> list[BoxType]:
    records = session.scalars(
        select(BoxTypeRecord).order_by(BoxTypeRecord.sort_key)
    ).all()
    return [_to_box_type(record) for record in records]


def find_box_type(session: Session, reference: str) -> BoxType | None:
    record = session.get(BoxTypeRecord, reference)
    return _to_box_type(record) if record else None


def add_box_type(session: Session, box: BoxType) -> BoxType:
    session.add(BoxTypeRecord(reference=box.reference, **_column_values(box)))
    try:
        session.flush()
    except IntegrityError as exc:
        session.rollback()
        raise DuplicateBoxReferenceError(box.reference) from exc
    return box.model_copy(deep=True)


def update_box_type(
    session: Session, reference: str, changes: BoxTypeUpdate
) -> BoxType | None:
    record = session.get(BoxTypeRecord, reference)
    if record is None:
        return None
    updated = BoxType(Reference=reference, **changes.model_dump(by_alias=True))
    for column, value in _column_values(updated).items():
        setattr(record, column, value)
    session.flush()
    return _to_box_type(record)


def delete_box_type(session: Session, reference: str) -> bool:
    """Solutions keep their sku text, so finalising one later reports the box as missing."""
    record = session.get(BoxTypeRecord, reference)
    if record is None:
        return False
    session.delete(record)
    session.flush()
    return True


def import_box_types(session: Session, imported: Iterable[BoxType]) -> list[BoxType]:
    records = list(imported)
    references = [box.reference for box in records]
    if len(references) != len(set(references)):
        raise DuplicateImportReferenceError(
            "Duplicate box Reference values are not allowed in an import"
        )
    if not records:
        return []

    for box in records:
        values = _column_values(box)
        statement = (
            pg_insert(BoxTypeRecord)
            .values(reference=box.reference, **values)
            .on_conflict_do_update(
                index_elements=[BoxTypeRecord.reference],
                set_={column: values[column] for column in _EDITABLE_COLUMNS},
            )
        )
        session.execute(statement)
    session.flush()
    # Core upserts bypass the identity map, so drop anything cached before
    # reading back exactly what this transaction wrote.
    session.expire_all()
    return [
        box
        for box in (find_box_type(session, reference) for reference in references)
        if box is not None
    ]


def active_box_types(session: Session) -> list[BoxType]:
    """Solver-eligible boxes: active, with no quantity limit or some remaining."""
    records = session.scalars(
        select(BoxTypeRecord)
        .where(
            BoxTypeRecord.active.is_(True),
            or_(BoxTypeRecord.maximum_boxes.is_(None), BoxTypeRecord.maximum_boxes > 0),
        )
        .order_by(BoxTypeRecord.sort_key)
    ).all()
    return [_to_box_type(record) for record in records]


def lock_box_types(
    session: Session, references: Iterable[str]
) -> dict[str, BoxTypeRecord]:
    """Lock rows in reference order to prevent concurrent deadlocks."""
    wanted = sorted(set(references))
    if not wanted:
        return {}
    records = session.scalars(
        select(BoxTypeRecord)
        .where(BoxTypeRecord.reference.in_(wanted))
        .order_by(BoxTypeRecord.reference)
        .with_for_update()
    ).all()
    return {record.reference: record for record in records}


def assess_requirements(
    session: Session, required: Mapping[str, int]
) -> InventoryFeasibility:
    """Advisory only; finalisation re-checks inventory under row locks."""
    references = set(required)
    if not references:
        return inventory.assess_requirements(required, {})
    records = session.scalars(
        select(BoxTypeRecord).where(BoxTypeRecord.reference.in_(references))
    ).all()
    current = {record.reference: _to_box_type(record) for record in records}
    return inventory.assess_requirements(required, current)


def consume_box_stock(session: Session, required: dict[str, int]) -> list[BoxType]:
    """Validate locked rows before deducting any stock. Unlimited boxes are never consumed."""
    locked = lock_box_types(session, required)

    feasibility = inventory.assess_requirements(
        required,
        {reference: _to_box_type(record) for reference, record in locked.items()},
    )
    if not feasibility.sufficient:
        raise InventoryConsumptionError(inventory.shortage_messages(feasibility))

    updated: list[BoxType] = []
    for reference, quantity in required.items():
        record = locked[reference]
        if record.maximum_boxes is not None:
            record.maximum_boxes = record.maximum_boxes - quantity
        updated.append(_to_box_type(record))
    session.flush()
    return updated
