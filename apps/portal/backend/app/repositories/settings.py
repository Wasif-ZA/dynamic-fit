"""Persistent site-wide manual handling warning configuration."""

from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.db.models import ManualHandlingSettingsRecord
from app.models import ManualHandlingSettings


def get_manual_handling(session: Session) -> ManualHandlingSettings:
    record = session.get(ManualHandlingSettingsRecord, 1)
    threshold = record.warning_threshold_kg if record is not None else None
    return ManualHandlingSettings(WarningThresholdKg=threshold)


def set_manual_handling(session: Session, settings: ManualHandlingSettings) -> ManualHandlingSettings:
    statement = insert(ManualHandlingSettingsRecord).values(
        id=1, warning_threshold_kg=settings.warning_threshold_kg
    ).on_conflict_do_update(
        index_elements=[ManualHandlingSettingsRecord.id],
        set_={"warning_threshold_kg": settings.warning_threshold_kg},
    )
    session.execute(statement)
    session.flush()
    return settings
