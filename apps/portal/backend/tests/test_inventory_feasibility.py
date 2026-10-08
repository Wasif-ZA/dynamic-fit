"""Advisory inventory feasibility tests."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session

from app import boxes, database, store
from app.db.models import BoxTypeRecord, OrderRecord, SolutionRecord
from app.inventory import required_cartons
from app.main import app
from app.models import BoxType, Role
from app.repositories import boxes as box_repository
from tests.box_fixtures import DEFAULT_BOX_TYPES
from tests.auth_helpers import auth_headers

client = TestClient(app)

SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
USER_HEADERS = auth_headers(Role.USER)

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


def add_inventory(*records: dict) -> None:
    for record in records:
        boxes.add_box_type(BoxType(**record))


def solution_document(*references: str, rejects: list[dict] | None = None) -> dict:
    return {
        "solution_id": "approved-solution",
        "order_id": "ORD-001",
        "metrics": {"carton_count": len(references), "fill_rate": 0.5, "total_mass": 1000},
        "solver": {"elapsed_ms": 1},
        "cartons": [
            {
                "carton_id": f"c{index}",
                "sku": reference,
                "placements": [],
                "contents_mass": 1000,
                "fill_rate": 0.5,
            }
            for index, reference in enumerate(references, start=1)
        ],
        "rejects": rejects or [],
    }


def optimised_order(document: dict) -> str:
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    stored = store.find_order(order_id)
    stored.status = "OPTIMISED"
    store.update_order(stored)
    store.save_solution(order_id, document)
    return order_id


def finalise(order_id: str, headers=SUPERVISOR_HEADERS):
    return client.post(f"/orders/{order_id}/finalise", headers=headers)


def feasibility(order_id: str) -> dict:
    response = client.get(f"/orders/{order_id}/solution/summary")
    assert response.status_code == 200, response.text
    return response.json()["InventoryFeasibility"]


def requirement(result: dict, reference: str) -> dict:
    return next(
        entry for entry in result["Requirements"] if entry["Reference"] == reference
    )


class TestRequirementCounting:
    def test_cartons_are_counted_by_sku(self):
        document = solution_document("MED", "SML", "MED", "MED")

        assert required_cartons(document) == {"MED": 3, "SML": 1}

    def test_a_solution_with_no_cartons_requires_nothing(self):
        assert required_cartons(solution_document()) == {}

    def test_finalisation_counts_requirements_the_same_way(self):
        document = solution_document("MED", "MED", "SML")
        add_inventory(MED, SML)
        order_id = optimised_order(document)

        assert finalise(order_id).status_code == 200

        assert boxes.find_box_type("MED").maximum_boxes == 3
        assert boxes.find_box_type("SML").maximum_boxes == 9


class TestSufficientInventory:
    def test_exactly_enough_stock_is_sufficient(self):
        add_inventory({**MED, "MaximumBoxes": 2})
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is True
        assert requirement(result, "MED") == {
            "Reference": "MED",
            "Required": 2,
            "Available": 2,
            "Active": True,
            "Exists": True,
            "Sufficient": True,
        }

    def test_surplus_stock_is_sufficient(self):
        add_inventory(MED)
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is True
        assert requirement(result, "MED")["Available"] == 5

    def test_a_sufficient_order_can_actually_be_finalised(self):
        add_inventory(MED)
        order_id = optimised_order(solution_document("MED", "MED"))
        assert feasibility(order_id)["Sufficient"] is True

        assert finalise(order_id).status_code == 200


class TestUnlimitedInventory:
    def test_no_quantity_limit_is_always_sufficient(self):
        add_inventory({**MED, "MaximumBoxes": None})
        order_id = optimised_order(solution_document(*(["MED"] * 50)))

        result = feasibility(order_id)

        assert result["Sufficient"] is True
        assert requirement(result, "MED") == {
            "Reference": "MED",
            "Required": 50,
            "Available": None,
            "Active": True,
            "Exists": True,
            "Sufficient": True,
        }

    def test_an_inactive_unlimited_box_is_still_insufficient(self):
        add_inventory({**MED, "MaximumBoxes": None, "Active": False})
        order_id = optimised_order(solution_document("MED"))

        assert feasibility(order_id)["Sufficient"] is False


class TestInsufficientInventory:
    def test_too_little_stock_reports_required_and_available(self):
        add_inventory({**MED, "MaximumBoxes": 1})
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert requirement(result, "MED") == {
            "Reference": "MED",
            "Required": 2,
            "Available": 1,
            "Active": True,
            "Exists": True,
            "Sufficient": False,
        }

    def test_zero_stock_is_insufficient_and_still_reported(self):
        add_inventory({**MED, "MaximumBoxes": 0})
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert requirement(result, "MED")["Available"] == 0
        assert requirement(result, "MED")["Exists"] is True

    def test_an_inactive_box_is_insufficient_even_with_plenty_of_stock(self):
        add_inventory({**MED, "Active": False})
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert requirement(result, "MED") == {
            "Reference": "MED",
            "Required": 2,
            "Available": 5,
            "Active": False,
            "Exists": True,
            "Sufficient": False,
        }

    def test_a_missing_reference_is_reported_cleanly_rather_than_crashing(self):
        order_id = optimised_order(solution_document("MED", "MED"))

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert requirement(result, "MED") == {
            "Reference": "MED",
            "Required": 2,
            "Available": None,
            "Active": None,
            "Exists": False,
            "Sufficient": False,
        }

    def test_every_shortage_is_reported_not_just_the_first(self):
        add_inventory({**MED, "MaximumBoxes": 1}, {**SML, "MaximumBoxes": 2})
        order_id = optimised_order(
            solution_document(*(["MED"] * 3), *(["SML"] * 4), "GONE")
        )

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert [
            (entry["Reference"], entry["Required"], entry["Available"])
            for entry in result["Requirements"]
        ] == [("MED", 3, 1), ("SML", 4, 2), ("GONE", 1, None)]
        assert all(not entry["Sufficient"] for entry in result["Requirements"])

    def test_a_mix_of_sufficient_and_insufficient_marks_each_correctly(self):
        add_inventory(MED, {**SML, "MaximumBoxes": 1})
        order_id = optimised_order(solution_document("MED", "SML", "SML"))

        result = feasibility(order_id)

        assert result["Sufficient"] is False
        assert requirement(result, "MED")["Sufficient"] is True
        assert requirement(result, "SML")["Sufficient"] is False


class TestFeasibilityIsReadOnly:
    def test_checking_feasibility_changes_no_inventory_order_or_solution(self):
        add_inventory({**MED, "MaximumBoxes": 1}, SML)
        document = solution_document("MED", "MED", "SML")
        order_id = optimised_order(document)

        for _ in range(3):
            assert feasibility(order_id)["Sufficient"] is False

        assert boxes.find_box_type("MED").maximum_boxes == 1
        assert boxes.find_box_type("SML").maximum_boxes == 10
        assert store.find_order(order_id).status == "OPTIMISED"
        assert store.find_solution(order_id) == document

    def test_the_repository_check_takes_no_locks(self):
        add_inventory(MED)
        engine = create_engine(database.get_database_url())
        holder = Session(engine)
        box_repository.lock_box_types(holder, ["MED"])
        try:
            with database.session_scope() as session:
                session.execute(text("SET LOCAL lock_timeout = '400ms'"))
                result = box_repository.assess_requirements(session, {"MED": 2})
            assert result.sufficient is True
        finally:
            holder.rollback()
            holder.close()
            engine.dispose()


class TestFeasibilityDoesNotAlterExistingContracts:
    def test_the_raw_solution_document_is_unchanged(self):
        add_inventory({**MED, "MaximumBoxes": 1})
        document = solution_document("MED", "MED")
        order_id = optimised_order(document)

        assert client.get(f"/orders/{order_id}/solution").json() == document

    def test_the_rest_of_the_summary_is_unchanged(self):
        add_inventory({**MED, "MaximumBoxes": 1})
        order_id = optimised_order(solution_document("MED", "MED"))

        summary = client.get(f"/orders/{order_id}/solution/summary").json()

        assert summary["OrderId"] == "ORD-001"
        assert summary["BoxCount"] == 2
        assert summary["Rejected"] == []
        assert set(summary) == {
            "OrderId",
            "InventoryFeasibility",
            "BoxCount",
            "FillRate",
            "TotalWeightKg",
            "SolveTimeMs",
            "ItemsPacked",
            "Boxes",
            "Rejected",
        }

    def test_insufficient_inventory_never_blocks_optimisation(self):
        boxes.add_box_type(
            DEFAULT_BOX_TYPES[0].model_copy(update={"maximum_boxes": 1})
        )
        order_id = client.post(
            "/orders", json={"Items": [{**ITEM, "Quantity": 60}]}
        ).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")

        response = client.post(f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS)

        assert response.status_code == 200
        assert len(response.json()["cartons"]) > 1
        assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"
        assert feasibility(order_id)["Sufficient"] is False

    def test_all_roles_can_read_feasibility(self):
        add_inventory({**MED, "MaximumBoxes": 1})
        order_id = optimised_order(solution_document("MED", "MED"))

        summary = client.get(
            f"/orders/{order_id}/solution/summary", headers=USER_HEADERS
        ).json()

        assert summary["InventoryFeasibility"]["Sufficient"] is False


class TestFinalOrders:
    def test_a_final_order_reports_no_feasibility_warning(self):
        add_inventory(MED)
        document = solution_document("MED", "MED")
        order_id = optimised_order(document)
        assert finalise(order_id).status_code == 200

        assert feasibility(order_id) is None

    def test_a_final_order_stays_quiet_even_when_stock_later_runs_out(self):
        add_inventory({**MED, "MaximumBoxes": 2})
        order_id = optimised_order(solution_document("MED", "MED"))
        assert finalise(order_id).status_code == 200
        assert boxes.find_box_type("MED").maximum_boxes == 0

        summary = client.get(f"/orders/{order_id}/solution/summary").json()

        assert summary["InventoryFeasibility"] is None
        assert summary["BoxCount"] == 2
        assert client.get(f"/orders/{order_id}").json()["Status"] == "FINAL"


class TestFinalisationRemainsAuthoritative:
    def test_stock_lost_after_a_feasible_answer_is_still_refused(self):
        add_inventory(MED)
        document = solution_document("MED", "MED")
        order_id = optimised_order(document)
        assert feasibility(order_id)["Sufficient"] is True

        competitor = optimised_order(solution_document(*(["MED"] * 4)))
        assert finalise(competitor).status_code == 200

        response = finalise(order_id)

        assert response.status_code == 409
        assert "requires 2 MED boxes, but only 1 is available" in response.json()["detail"]
        with_records = client.get(f"/orders/{order_id}").json()
        assert with_records["Status"] == "OPTIMISED"
        assert boxes.find_box_type("MED").maximum_boxes == 1
        assert store.find_solution(order_id) == document

    def test_the_conflict_detail_still_lists_every_problem(self):
        add_inventory({**MED, "Active": False})
        order_id = optimised_order(solution_document("MED", "MISSING"))

        detail = finalise(order_id).json()["detail"]

        assert "1 MED box, but that box type is inactive" in detail
        assert "1 MISSING box, but that box type is missing" in detail

    def test_a_failed_finalisation_still_leaves_the_database_untouched(self):
        add_inventory({**MED, "MaximumBoxes": 1}, SML)
        document = solution_document("MED", "MED", "SML")
        order_id = optimised_order(document)

        assert finalise(order_id).status_code == 409

        with database.session_scope() as session:
            assert session.get(BoxTypeRecord, "MED").maximum_boxes == 1
            assert session.get(BoxTypeRecord, "SML").maximum_boxes == 10
            assert session.get(OrderRecord, order_id).status == "OPTIMISED"
            assert session.get(SolutionRecord, order_id).solution_json == document
            assert len(session.scalars(select(SolutionRecord)).all()) == 1
