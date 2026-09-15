"""Transaction and row-locking tests."""

from __future__ import annotations

import threading
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from app import boxes, database, finalisation, store
from app.db.models import BoxTypeRecord, OrderItemRecord, OrderRecord, SolutionRecord
from app.errors import InventoryConsumptionError, OrderStatusConflictError
from app.main import app
from app.models import BoxType, Item, Order, Role
from app.repositories import boxes as box_repository
from app.repositories import orders as order_repository
from app.repositories import solutions as solution_repository
from tests.auth_helpers import auth_headers

client = TestClient(app)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)

ITEM = {
    "ItemCode": "ITM-001",
    "ItemReference": "Widget",
    "Width": 100,
    "Length": 100,
    "Depth": 100,
    "Weight": 1,
}
MED = {
    "Reference": "MED",
    "Width": 400,
    "Length": 300,
    "Depth": 250,
    "MaxWeight": 30,
    "BoxWeight": 0.3,
    "Active": True,
    "MaximumBoxes": 5,
}
SML = {
    "Reference": "SML",
    "Width": 220,
    "Length": 160,
    "Depth": 120,
    "MaxWeight": 15,
    "BoxWeight": 0.12,
    "Active": True,
    "MaximumBoxes": 10,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def replica_engine():
    engine = create_engine(database.get_database_url())
    yield engine
    engine.dispose()


def committed(engine) -> Session:
    return Session(engine)


def add_inventory(*records: dict) -> None:
    for record in records:
        boxes.add_box_type(BoxType(**record))


def solution_document(*references: str, rejects: list[dict] | None = None) -> dict:
    return {
        "solution_id": "approved-solution",
        "order_id": "ORD-001",
        "cartons": [
            {"carton_id": f"c{index}", "sku": reference, "placements": []}
            for index, reference in enumerate(references, start=1)
        ],
        "rejects": rejects or [],
    }


def optimised_order(document: dict | None) -> str:
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    stored = store.find_order(order_id)
    stored.status = "OPTIMISED"
    store.update_order(stored)
    if document is not None:
        store.save_solution(order_id, document)
    return order_id


class TestOrderCreationIsAtomic:
    def test_a_failed_creation_leaves_neither_order_nor_items(self, replica_engine):
        order = Order(Items=[Item(**ITEM), Item(**{**ITEM, "ItemCode": "ITM-002"})])

        with pytest.raises(RuntimeError):
            with database.session_scope() as session:
                order_repository.create_order(session, order)
                raise RuntimeError("something failed after the items were inserted")

        with committed(replica_engine) as session:
            assert session.scalars(select(OrderRecord)).all() == []
            assert session.scalars(select(OrderItemRecord)).all() == []

    def test_a_successful_creation_commits_the_order_with_all_of_its_items(
        self, replica_engine
    ):
        client.post(
            "/orders",
            json={"Items": [ITEM, {**ITEM, "ItemCode": "ITM-002"}, {**ITEM, "ItemCode": "ITM-003"}]},
        )

        with committed(replica_engine) as session:
            assert len(session.scalars(select(OrderRecord)).all()) == 1
            assert len(session.scalars(select(OrderItemRecord)).all()) == 3


class TestOrderEditIsAtomic:
    def test_items_status_and_solution_invalidation_commit_together(
        self, replica_engine
    ):
        order_id = optimised_order(solution_document("MED"))

        response = client.put(
            f"/orders/{order_id}", json={"Items": [{**ITEM, "ItemCode": "ITM-007"}]}
        )

        assert response.status_code == 200
        with committed(replica_engine) as session:
            assert session.get(OrderRecord, order_id).status == "DRAFT"
            assert session.get(SolutionRecord, order_id) is None
            item = session.scalars(
                select(OrderItemRecord).where(OrderItemRecord.order_id == order_id)
            ).one()
            assert item.item_code == "ITM-007"

    def test_a_failed_replacement_keeps_the_items_status_and_solution(
        self, replica_engine
    ):
        document = solution_document("MED")
        order_id = optimised_order(document)
        # Force a mid-replacement failure with a duplicate position.
        broken = [Item(**ITEM), Item(**{**ITEM, "ItemCode": "ITM-002"})]

        with pytest.raises(IntegrityError):
            with database.session_scope() as session:
                record = order_repository.lock_record(session, order_id)
                order_repository.replace_items(session, record, broken)
                session.add(
                    OrderItemRecord(
                        order_id=order_id,
                        position=0,
                        item_code="ITM-999",
                        item_reference="Duplicate position",
                        width=1,
                        length=1,
                        depth=1,
                        weight=1,
                        quantity=1,
                    )
                )
                order_repository.set_status(session, record, "DRAFT")
                solution_repository.invalidate_solution(session, order_id)
                session.flush()

        with committed(replica_engine) as session:
            assert session.get(OrderRecord, order_id).status == "OPTIMISED"
            assert session.get(SolutionRecord, order_id).solution_json == document
            assert [
                item.item_code
                for item in session.scalars(
                    select(OrderItemRecord).where(OrderItemRecord.order_id == order_id)
                )
            ] == ["ITM-001"]

    def test_a_final_order_is_rejected_before_anything_is_touched(self):
        add_inventory(MED)
        document = solution_document("MED")
        order_id = optimised_order(document)
        assert client.post(
            f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS
        ).status_code == 200

        response = client.put(f"/orders/{order_id}", json={"Items": [ITEM]})

        assert response.status_code == 409
        assert store.find_solution(order_id) == document
        assert store.find_order(order_id).status == "FINAL"


class TestBoxImportIsAtomic:
    def test_a_failed_batch_creates_and_updates_nothing(self, replica_engine):
        add_inventory(MED)
        # Bypass Pydantic to force a database failure mid-batch.
        invalid = BoxType.model_construct(
            reference="BAD", width=-1, length=1, depth=1,
            max_weight=None, box_weight=None, active=True, maximum_boxes=1,
        )

        with pytest.raises(IntegrityError):
            with database.session_scope() as session:
                box_repository.import_box_types(
                    session,
                    [BoxType(**{**MED, "MaximumBoxes": 99}), BoxType(**SML), invalid],
                )

        with committed(replica_engine) as session:
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 5
            assert session.get(BoxTypeRecord, "SML") is None
            assert session.get(BoxTypeRecord, "BAD") is None

    def test_a_successful_batch_commits_every_record_at_once(self, replica_engine):
        add_inventory(MED)

        response = client.post(
            "/boxes/import",
            json={"Boxes": [{**MED, "MaximumBoxes": 20}, SML]},
            headers=SUPERVISOR_HEADERS,
        )

        assert response.status_code == 200
        with committed(replica_engine) as session:
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 20
            assert session.get(BoxTypeRecord, "SML").maximum_boxes == 10

    def test_an_import_never_moves_an_existing_record_in_the_listing(self):
        add_inventory(MED, SML)

        client.post(
            "/boxes/import",
            json={"Boxes": [SML, {**MED, "MaximumBoxes": 1}]},
            headers=SUPERVISOR_HEADERS,
        )

        assert [box.reference for box in boxes.list_box_types()] == ["MED", "SML"]


class TestSolvePersistenceIsTransactional:
    def test_a_solution_is_only_stored_for_a_still_solvable_order(
        self, replica_engine
    ):
        order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]

        with pytest.raises(OrderStatusConflictError):
            store.save_solution_for_optimised_order(order_id, solution_document("MED"))

        with committed(replica_engine) as session:
            assert session.get(SolutionRecord, order_id) is None
            assert session.get(OrderRecord, order_id).status == "DRAFT"

    def test_the_solution_and_the_optimised_status_commit_together(
        self, replica_engine
    ):
        order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")
        document = solution_document("MED")

        store.save_solution_for_optimised_order(order_id, document)

        with committed(replica_engine) as session:
            assert session.get(OrderRecord, order_id).status == "OPTIMISED"
            assert session.get(SolutionRecord, order_id).solution_json == document


class TestFinalisationIsAtomic:
    def test_success_deducts_exact_stock_and_sets_final_in_one_commit(
        self, replica_engine
    ):
        add_inventory(MED, SML)
        order_id = optimised_order(solution_document("MED", "MED", "MED", "MED", "SML", "SML"))

        assert client.post(
            f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS
        ).status_code == 200

        with committed(replica_engine) as session:
            assert session.get(OrderRecord, order_id).status == "FINAL"
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 1
            assert session.get(BoxTypeRecord, "SML").maximum_boxes == 8

    def test_insufficient_stock_deducts_nothing_at_all(self, replica_engine):
        add_inventory({**MED, "MaximumBoxes": 1}, SML)
        document = solution_document("MED", "MED", "SML", "SML")
        order_id = optimised_order(document)

        response = client.post(
            f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS
        )

        assert response.status_code == 409
        with committed(replica_engine) as session:
            assert session.get(BoxTypeRecord, "SML").maximum_boxes == 10
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 1
            assert session.get(OrderRecord, order_id).status == "OPTIMISED"
            assert session.get(SolutionRecord, order_id).solution_json == document

    def test_a_missing_box_type_blocks_the_whole_deduction(self, replica_engine):
        add_inventory(MED)
        order_id = optimised_order(solution_document("MED", "GONE"))

        with pytest.raises(InventoryConsumptionError):
            finalisation.finalise_order(order_id)

        with committed(replica_engine) as session:
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 5
            assert session.get(OrderRecord, order_id).status == "OPTIMISED"

    def test_final_state_survives_a_new_session_and_stays_immutable(
        self, replica_engine
    ):
        add_inventory(MED)
        document = solution_document("MED")
        order_id = optimised_order(document)
        client.post(f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS)

        with committed(replica_engine) as session:
            assert session.get(OrderRecord, order_id).status == "FINAL"

        assert store.find_order(order_id).status == "FINAL"
        assert client.put(f"/orders/{order_id}", json={"Items": [ITEM]}).status_code == 409
        assert client.post(f"/orders/{order_id}/submit").status_code == 409
        assert client.post(
            f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS
        ).status_code == 409
        assert client.post(
            f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS
        ).status_code == 409
        assert client.get(f"/orders/{order_id}/solution").json() == document


class TestFinalisationLocksInventoryRows:
    """Exercise collisions through independent database sessions."""

    def test_locking_inventory_blocks_another_transaction_from_locking_it(
        self, replica_engine
    ):
        add_inventory(MED)

        holder = Session(replica_engine)
        box_repository.lock_box_types(holder, ["MED"])
        try:
            with pytest.raises(OperationalError) as blocked:
                with database.session_scope() as session:
                    session.execute(text("SET LOCAL lock_timeout = '400ms'"))
                    box_repository.lock_box_types(session, ["MED"])
            assert "lock timeout" in str(blocked.value).lower()
        finally:
            holder.rollback()
            holder.close()

    def test_a_blocked_finalisation_re_reads_stock_and_cannot_oversubscribe(
        self, replica_engine
    ):
        add_inventory(MED)
        blocked_order = optimised_order(solution_document("MED", "MED", "MED", "MED"))
        outcome: list[object] = []

        competitor = Session(replica_engine)
        box_repository.lock_box_types(competitor, ["MED"])

        def finalise() -> None:
            try:
                outcome.append(finalisation.finalise_order(blocked_order).status)
            except Exception as exc:  # noqa: BLE001 - reported through `outcome`
                outcome.append(exc)

        worker = threading.Thread(target=finalise)
        worker.start()
        try:
            time.sleep(0.4)
            assert worker.is_alive(), "finalisation did not wait for the locked row"
            assert outcome == []
            box_repository.consume_box_stock(competitor, {"MED": 4})
            competitor.commit()
        finally:
            competitor.close()

        worker.join(timeout=15)
        assert not worker.is_alive()

        assert len(outcome) == 1
        assert isinstance(outcome[0], InventoryConsumptionError), outcome[0]
        assert "only 1 is available" in str(outcome[0])
        assert boxes.find_box_type("MED").maximum_boxes == 1
        assert store.find_order(blocked_order).status == "OPTIMISED"

    def test_a_released_lock_lets_a_waiting_finalisation_complete(
        self, replica_engine
    ):
        add_inventory(MED)
        order_id = optimised_order(solution_document("MED"))
        outcome: list[object] = []

        holder = Session(replica_engine)
        box_repository.lock_box_types(holder, ["MED"])

        def finalise() -> None:
            try:
                outcome.append(finalisation.finalise_order(order_id).status)
            except Exception as exc:  # noqa: BLE001 - reported through `outcome`
                outcome.append(exc)

        worker = threading.Thread(target=finalise)
        worker.start()
        try:
            time.sleep(0.4)
            assert worker.is_alive()
        finally:
            holder.rollback()
            holder.close()

        worker.join(timeout=15)
        assert outcome == ["FINAL"]
        assert boxes.find_box_type("MED").maximum_boxes == 4

    def test_concurrent_finalisations_never_drive_stock_negative(self):
        add_inventory(MED)
        first = optimised_order(solution_document("MED", "MED", "MED", "MED"))
        second = optimised_order(solution_document("MED", "MED", "MED", "MED"))

        start = threading.Barrier(2)
        results: dict[str, object] = {}

        def finalise(order_id: str) -> None:
            start.wait(timeout=10)
            try:
                results[order_id] = finalisation.finalise_order(order_id).status
            except Exception as exc:  # noqa: BLE001 - reported through `results`
                results[order_id] = exc

        workers = [
            threading.Thread(target=finalise, args=(order_id,))
            for order_id in (first, second)
        ]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=15)

        succeeded = [key for key, value in results.items() if value == "FINAL"]

        assert len(succeeded) == 1, results
        assert boxes.find_box_type("MED").maximum_boxes == 1
        loser = first if succeeded[0] == second else second
        assert store.find_order(loser).status == "OPTIMISED"
