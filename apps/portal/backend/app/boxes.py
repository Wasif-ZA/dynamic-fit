"""Deployment-wide Box Inventory API."""

from __future__ import annotations

from sqlalchemy import delete

from app.database import session_scope
from app.db.models import BoxTypeRecord
from app.errors import (
    DuplicateBoxReferenceError,
    DuplicateImportReferenceError,
    InventoryConsumptionError,
)
from app.inventory import required_cartons
from app.models import BoxType, BoxTypeUpdate, InventoryFeasibility
from app.repositories import boxes as box_repository

__all__ = [
    "DuplicateBoxReferenceError",
    "DuplicateImportReferenceError",
    "InventoryConsumptionError",
    "active_box_types",
    "add_box_type",
    "assess_solution_inventory",
    "delete_box_type",
    "find_box_type",
    "import_box_types",
    "list_box_types",
    "reset_box_inventory",
    "update_box_type",
]


def reset_box_inventory() -> None:
    with session_scope() as session:
        session.execute(delete(BoxTypeRecord))


def list_box_types() -> list[BoxType]:
    with session_scope() as session:
        return box_repository.list_box_types(session)


def find_box_type(reference: str) -> BoxType | None:
    with session_scope() as session:
        return box_repository.find_box_type(session, reference)


def add_box_type(box: BoxType) -> BoxType:
    with session_scope() as session:
        return box_repository.add_box_type(session, box)


def update_box_type(reference: str, changes: BoxTypeUpdate) -> BoxType | None:
    with session_scope() as session:
        return box_repository.update_box_type(session, reference, changes)


def delete_box_type(reference: str) -> bool:
    with session_scope() as session:
        return box_repository.delete_box_type(session, reference)


def import_box_types(imported: list[BoxType]) -> list[BoxType]:
    with session_scope() as session:
        return box_repository.import_box_types(session, imported)


def active_box_types() -> list[BoxType]:
    with session_scope() as session:
        return box_repository.active_box_types(session)


def assess_solution_inventory(solution: dict) -> InventoryFeasibility:
    """Advisory only; finalisation re-checks inventory under row locks."""
    with session_scope() as session:
        return box_repository.assess_requirements(
            session, required_cartons(solution)
        )
