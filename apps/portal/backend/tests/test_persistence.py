"""PostgreSQL persistence tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app import boxes, database, store
from app.db.models import BoxTypeRecord, OrderItemRecord, OrderRecord, SolutionRecord
from app.main import app
from app.models import BoxType, Role
from app.repositories.orders import next_order_identity
from tests.auth_helpers import auth_headers

client = TestClient(app)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
USER_HEADERS = auth_headers(Role.USER)

ITEM = {
    "ItemCode": "ITM-001",
    "ItemReference": "Widget A",
    "Width": 100,
    "Length": 200,
    "Depth": 50,
    "Weight": 1.25,
}
SECOND_ITEM = {
    "ItemCode": "ITM-002",
    "ItemReference": "Widget B",
    "Width": 300,
    "Length": 150,
    "Depth": 75,
    "Weight": 2.8,
    "BoxGroup": "GROUP-A",
    "Quantity": 3,
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


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    yield
    store.reset()


@pytest.fixture
def replica_session():
    engine = create_engine(database.get_database_url())
    with Session(engine) as session:
        yield session
    engine.dispose()


def create_order(items: list[dict]) -> str:
    response = client.post("/orders", json={"Items": items})
    assert response.status_code == 201, response.text
    return response.json()["OrderId"]


class TestOrderPersistence:
    def test_a_created_order_is_visible_to_another_replica(self, replica_session):
        order_id = create_order([ITEM])

        record = replica_session.get(OrderRecord, order_id)

        assert record is not None
        assert record.reference == "MQ-001"
        assert record.status == "DRAFT"

    def test_order_items_are_stored_relationally_with_every_field(
        self, replica_session
    ):
        order_id = create_order([SECOND_ITEM])

        item = replica_session.scalars(
            select(OrderItemRecord).where(OrderItemRecord.order_id == order_id)
        ).one()

        assert item.item_code == "ITM-002"
        assert item.item_reference == "Widget B"
        assert (item.width, item.length, item.depth) == (300, 150, 75)
        assert float(item.weight) == pytest.approx(2.8)
        assert item.box_group == "GROUP-A"
        assert item.quantity == 3
        assert not hasattr(item, "hazardous")

    def test_items_keep_their_submitted_order_through_an_explicit_position(
        self, replica_session
    ):
        order_id = create_order([SECOND_ITEM, ITEM])

        stored = replica_session.scalars(
            select(OrderItemRecord)
            .where(OrderItemRecord.order_id == order_id)
            .order_by(OrderItemRecord.position)
        ).all()

        assert [item.position for item in stored] == [0, 1]
        assert [item.item_code for item in stored] == ["ITM-002", "ITM-001"]
        assert [item["ItemCode"] for item in client.get(f"/orders/{order_id}").json()["Items"]] == [
            "ITM-002",
            "ITM-001",
        ]

    def test_an_order_reconstructs_identically_from_a_new_session(self):
        created = client.post("/orders", json={"Items": [SECOND_ITEM, ITEM]}).json()

        assert client.get(f"/orders/{created['OrderId']}").json() == created

    def test_editing_replaces_items_and_repositions_them(self, replica_session):
        order_id = create_order([ITEM, SECOND_ITEM])

        client.put(f"/orders/{order_id}", json={"Items": [SECOND_ITEM]})

        stored = replica_session.scalars(
            select(OrderItemRecord)
            .where(OrderItemRecord.order_id == order_id)
            .order_by(OrderItemRecord.position)
        ).all()
        assert [(item.position, item.item_code) for item in stored] == [(0, "ITM-002")]

    def test_orders_are_listed_newest_first_by_committed_state(self):
        first = create_order([ITEM])
        second = create_order([ITEM])
        third = create_order([ITEM])

        listed = [order["OrderId"] for order in client.get("/orders").json()]

        assert listed == [third, second, first]

    def test_a_status_change_is_committed_not_held_in_the_process(
        self, replica_session
    ):
        order_id = create_order([ITEM])

        client.post(f"/orders/{order_id}/submit")

        replica_session.expire_all()
        assert (
            replica_session.get(OrderRecord, order_id).status
            == "AWAITING_OPTIMISATION"
        )


class TestIdentityGeneration:
    def test_order_ids_and_references_come_from_postgresql_sequences(self):
        first = client.post("/orders", json={"Items": [ITEM]}).json()
        second = client.post("/orders", json={"Items": [ITEM]}).json()

        assert (first["OrderId"], first["Reference"]) == ("ORD-001", "MQ-001")
        assert (second["OrderId"], second["Reference"]) == ("ORD-002", "MQ-002")

    def test_identity_keeps_advancing_for_a_session_that_did_not_mint_it(self):
        create_order([ITEM])

        with database.session_scope() as session:
            _, order_id, reference = next_order_identity(session)

        assert (order_id, reference) == ("ORD-002", "MQ-002")

    def test_references_are_unique_across_many_orders(self):
        references = {
            client.post("/orders", json={"Items": [ITEM]}).json()["Reference"]
            for _ in range(10)
        }

        assert len(references) == 10

    def test_a_rolled_back_transaction_may_leave_a_reference_gap(self):
        with pytest.raises(RuntimeError):
            with database.session_scope() as session:
                next_order_identity(session)
                raise RuntimeError("abandoned order creation")

        created = client.post("/orders", json={"Items": [ITEM]}).json()

        assert created["OrderId"] == "ORD-002"
        assert created["Reference"] == "MQ-002"
        assert client.get("/orders").json()[0]["OrderId"] == "ORD-002"


class TestBoxInventoryPersistence:
    def test_a_fresh_database_has_no_box_inventory(self, replica_session):
        assert replica_session.scalars(select(BoxTypeRecord)).all() == []
        assert client.get("/boxes", headers=USER_HEADERS).json() == []

    def test_an_imported_box_is_committed_for_every_replica(self, replica_session):
        client.post(
            "/boxes/import", json={"Boxes": [MED]}, headers=SUPERVISOR_HEADERS
        )

        record = replica_session.get(BoxTypeRecord, "MED")

        assert record is not None
        assert record.maximum_boxes == 5
        assert record.active is True
        assert float(record.box_weight) == pytest.approx(0.3)

    def test_inventory_survives_a_new_application_session(self):
        boxes.add_box_type(BoxType(**MED))

        assert boxes.find_box_type("MED").maximum_boxes == 5

    def test_zero_stock_records_stay_visible_but_are_not_solver_eligible(self):
        boxes.add_box_type(BoxType(**{**MED, "MaximumBoxes": 0}))

        assert [box.reference for box in boxes.list_box_types()] == ["MED"]
        assert boxes.active_box_types() == []

    def test_missing_and_zero_maximum_boxes_are_stored_distinctly(self, replica_session):
        open_box = {key: value for key, value in MED.items() if key != "MaximumBoxes"}
        response = client.post(
            "/boxes/import",
            json={"Boxes": [
                {**open_box, "Reference": "OPEN"},
                {**MED, "Reference": "NONE-LEFT", "MaximumBoxes": 0},
            ]},
            headers=SUPERVISOR_HEADERS,
        )

        assert response.status_code == 200
        assert replica_session.get(BoxTypeRecord, "OPEN").maximum_boxes is None
        assert replica_session.get(BoxTypeRecord, "NONE-LEFT").maximum_boxes == 0
        assert [box.reference for box in boxes.active_box_types()] == ["OPEN"]

    def test_box_references_remain_case_sensitive(self):
        boxes.add_box_type(BoxType(**MED))
        boxes.add_box_type(BoxType(**{**MED, "Reference": "med"}))

        assert sorted(box.reference for box in boxes.list_box_types()) == ["MED", "med"]


class TestSolutionPersistence:
    def solve_an_order(self) -> tuple[str, dict]:
        boxes.add_box_type(BoxType(**MED))
        order_id = create_order([ITEM])
        client.post(f"/orders/{order_id}/submit")
        response = client.post(f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS)
        assert response.status_code == 200, response.text
        return order_id, response.json()

    def test_the_solver_document_is_stored_as_a_jsonb_object(self, replica_session):
        order_id, document = self.solve_an_order()

        stored_type = replica_session.scalar(
            text("SELECT jsonb_typeof(solution_json) FROM solutions WHERE order_id = :id"),
            {"id": order_id},
        )

        assert stored_type == "object"
        assert replica_session.get(SolutionRecord, order_id).solution_json == document

    def test_the_stored_document_is_returned_unchanged_to_the_visualiser(self):
        order_id, document = self.solve_an_order()

        assert client.get(f"/orders/{order_id}/solution").json() == document

    def test_reoptimising_replaces_the_single_active_solution(self, replica_session):
        order_id, first = self.solve_an_order()

        second = client.post(
            f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS
        ).json()

        assert first["solution_id"] != second["solution_id"]
        replica_session.expire_all()
        assert len(replica_session.scalars(select(SolutionRecord)).all()) == 1
        assert replica_session.get(SolutionRecord, order_id).solution_json == second

    def test_editing_an_optimised_order_deletes_the_active_solution_row(
        self, replica_session
    ):
        order_id, _ = self.solve_an_order()

        client.put(f"/orders/{order_id}", json={"Items": [SECOND_ITEM]})

        replica_session.expire_all()
        assert replica_session.get(SolutionRecord, order_id) is None
        assert client.get(f"/orders/{order_id}/solution").status_code == 404

    def test_a_deleted_order_takes_its_items_and_solution_with_it(
        self, replica_session
    ):
        order_id, _ = self.solve_an_order()

        with database.session_scope() as session:
            session.delete(session.get(OrderRecord, order_id))

        replica_session.expire_all()
        assert replica_session.get(SolutionRecord, order_id) is None
        assert (
            replica_session.scalars(
                select(OrderItemRecord).where(OrderItemRecord.order_id == order_id)
            ).all()
            == []
        )
