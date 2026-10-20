"""Calendar-month retention, legacy migration and browser-independent sweeps."""

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import boxes, database, maintenance, store
from app.db.models import OrderRecord
from app.main import app, lifespan
from app.models import Role
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
MANAGER = auth_headers(Role.SUPERVISOR)
ITEM = {"ItemCode": "TIMER", "ItemReference": "Timer test", "Width": 100, "Length": 100, "Depth": 100, "Weight": 1}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    for box in DEFAULT_BOX_TYPES:
        boxes.add_box_type(box)
    yield
    store.reset()


def final_order():
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    assert client.post(f"/orders/{order_id}/solve", headers=MANAGER).status_code == 200
    response = client.post(f"/orders/{order_id}/finalise", headers=MANAGER)
    assert response.status_code == 200, response.text
    assert response.json()["FinalisedAt"]
    return order_id


@pytest.mark.parametrize("finalised, due", [
    ("2026-10-20T12:30:00+00:00", "2026-11-20T12:30:00+00:00"),
    ("2027-01-31T12:30:00+00:00", "2027-02-28T12:30:00+00:00"),
    ("2028-01-31T12:30:00+00:00", "2028-02-29T12:30:00+00:00"),
    ("2026-03-31T12:30:00+00:00", "2026-04-30T12:30:00+00:00"),
    ("2026-12-31T12:30:00+00:00", "2027-01-31T12:30:00+00:00"),
])
def test_archive_occurs_one_calendar_month_after_finalisation(finalised, due):
    order_id = final_order()
    completion = datetime.fromisoformat(finalised)
    deadline = datetime.fromisoformat(due)
    with database.session_scope() as session:
        record = session.get(OrderRecord, order_id)
        record.created_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        record.finalised_at = completion
    solution = store.find_solution(order_id)
    stock = client.get("/boxes").json()

    assert store.archive_due_orders(now=deadline - timedelta(microseconds=1)) == 0
    assert store.find_order(order_id).archived_at is None
    assert store.archive_due_orders(now=deadline) == 1
    assert store.find_order(order_id).archived_at == deadline
    assert store.find_order(order_id).finalised_at == completion
    assert store.archive_due_orders(now=deadline + timedelta(days=100)) == 0
    assert store.find_order(order_id).archived_at == deadline
    assert store.find_solution(order_id) == solution
    assert client.get("/boxes").json() == stock


def test_age_of_unfinished_or_recently_finalised_orders_does_not_archive_them():
    unfinished = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    completed = final_order()
    now = datetime(2026, 10, 20, tzinfo=timezone.utc)
    with database.session_scope() as session:
        for order_id in [unfinished, completed]:
            session.get(OrderRecord, order_id).created_at = datetime(2020, 1, 1, tzinfo=timezone.utc)
        session.get(OrderRecord, completed).finalised_at = now - timedelta(days=1)
    store.hold_order(unfinished)

    assert store.archive_due_orders(now=now) == 0
    assert store.find_order(unfinished).held_at is not None
    assert store.find_order(completed).archived_at is None


def test_migration_keeps_existing_orders_active_and_starts_unknown_completion_dates_now():
    migration = Path(__file__).resolve().parents[2] / "supabase/migrations/20261020090000_add_order_archiving.sql"
    with database.get_engine().begin() as connection:
        connection.execute(text("CREATE TEMP TABLE orders (order_id text, status text) ON COMMIT DROP"))
        connection.execute(text("INSERT INTO orders VALUES ('draft', 'DRAFT'), ('old-final', 'FINAL')"))
        migration_time = connection.scalar(text("SELECT current_timestamp"))
        connection.execute(text(migration.read_text()))
        rows = {row.order_id: row for row in connection.execute(text("SELECT * FROM orders"))}
        assert rows['draft'].archived_at is None
        assert rows['draft'].held_at is None
        assert rows['draft'].finalised_at is None
        assert rows['old-final'].archived_at is None
        assert rows['old-final'].finalised_at == migration_time
        assert len(rows) == 2


def test_startup_runs_a_catch_up_sweep_and_stops_the_worker_cleanly(monkeypatch):
    calls = []
    monkeypatch.setattr(store, "archive_due_orders", lambda: calls.append('sweep'))
    async def exercise_lifespan():
        async with lifespan(app):
            assert calls == ['sweep']
    asyncio.run(exercise_lifespan())


def test_background_archiving_retries_after_a_failed_sweep(monkeypatch, caplog):
    sleeps = []
    calls = []
    async def fake_sleep(seconds):
        sleeps.append(seconds)
        if len(sleeps) == 3:
            raise asyncio.CancelledError()
    def sweep():
        calls.append('sweep')
        if len(calls) == 1:
            raise RuntimeError('temporary database failure')
    monkeypatch.setattr(maintenance.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(store, "archive_due_orders", sweep)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(maintenance.archive_loop())
    assert calls == ['sweep', 'sweep']
    assert sleeps == [60, 60, 60]
    assert 'next sweep will retry' in caplog.text
