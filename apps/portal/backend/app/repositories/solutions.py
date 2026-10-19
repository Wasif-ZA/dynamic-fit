"""Active FitSolver solution persistence."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.models import SolutionRecord


def find_solution(session: Session, order_id: str) -> dict | None:
    record = session.get(SolutionRecord, order_id)
    return record.solution_json if record else None


def save_solution(session: Session, order_id: str, document: dict) -> dict:
    record = session.get(SolutionRecord, order_id)
    if record is None:
        session.add(SolutionRecord(order_id=order_id, solution_json=document))
    else:
        record.solution_json = document
        record.updated_at = func.now()
    return document


def invalidate_solution(session: Session, order_id: str) -> None:
    """Discard stale results. TODO: retain solution version history."""
    record = session.get(SolutionRecord, order_id)
    if record is not None:
        session.delete(record)
