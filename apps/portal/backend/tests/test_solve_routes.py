"""Solve routes: status codes, summary shape, box catalogue."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from fitsolver import portal

from app import store
from app.boxes import DEFAULT_BOX_TYPES, active_box_types
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_store():
    store.reset()
    yield
    store.reset()


def an_item(code="MUG", **overrides) -> dict:
    payload = {
        "ItemCode": code,
        "ItemReference": f"SKU-{code}",
        "Width": 100,
        "Length": 100,
        "Depth": 120,
        "Weight": 0.35,
    }
    payload.update(overrides)
    return payload


def create_order(items: list[dict]) -> str:
    response = client.post("/orders", json={"Items": items})
    assert response.status_code == 201, response.text
    return response.json()["OrderId"]


def test_solving_returns_a_solution_document():
    order_id = create_order([an_item()])
    response = client.post(f"/orders/{order_id}/solve")

    assert response.status_code == 200, response.text
    document = response.json()
    assert document["order_id"] == order_id
    assert document["schema_version"] == "1.0.0"


def test_solving_an_unknown_order_is_a_404():
    response = client.post("/orders/ORD-9999/solve")
    assert response.status_code == 404
    assert response.json()["detail"] == "Order not found"


def test_reading_a_solution_before_solving_is_a_404():
    order_id = create_order([an_item()])
    response = client.get(f"/orders/{order_id}/solution")
    assert response.status_code == 404
    assert "has not been solved" in response.json()["detail"]


def test_the_solution_is_stored_and_read_back_unchanged():
    order_id = create_order([an_item()])
    solved = client.post(f"/orders/{order_id}/solve").json()
    assert client.get(f"/orders/{order_id}/solution").json() == solved


def test_summary_reports_kilograms_for_the_order_page():
    order_id = create_order([an_item(Weight=2.5)])
    client.post(f"/orders/{order_id}/solve")

    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["OrderId"] == order_id
    assert summary["BoxCount"] == 1
    assert summary["Boxes"][0]["ContentsWeightKg"] == pytest.approx(2.5, abs=0.001)
    assert summary["Rejected"] == []


def test_summary_lists_rejected_items_for_the_packer():
    order_id = create_order([an_item("PALLET", Width=1200, Length=800, Depth=1000, Weight=450.0)])
    client.post(f"/orders/{order_id}/solve")

    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["BoxCount"] == 0
    assert summary["Rejected"][0]["ItemCode"] == "PALLET"
    assert summary["Rejected"][0]["Reason"] == "NO_FITTING_CARTON"
    assert summary["Rejected"][0]["Detail"]


def test_summary_for_an_unsolved_order_is_a_404():
    order_id = create_order([an_item()])
    assert client.get(f"/orders/{order_id}/solution/summary").status_code == 404


def test_the_catalogue_reproduces_the_committed_fixture_interiors():
    payload = {
        "order_id": "X",
        "items": [an_item()],
        "Boxes": [b.model_dump(by_alias=True, exclude_none=True, mode="json") for b in active_box_types()],
    }
    cartons = portal.to_contract(payload)["cartons"]
    interiors = {c["sku"]: c["inner_dims"] for c in cartons}

    assert interiors == {
        "BOX-S": [220, 160, 120],
        "BOX-M": [320, 240, 180],
        "BOX-L": [450, 350, 300],
    }


def test_inactive_box_types_are_not_offered_to_the_solver():
    assert all(box.active for box in active_box_types())
    assert len(active_box_types()) == len(DEFAULT_BOX_TYPES)


def test_solving_marks_the_order_as_packed():
    order_id = create_order([an_item()])
    assert client.get(f"/orders/{order_id}").json()["Status"] == "Draft"

    client.post(f"/orders/{order_id}/solve")

    assert client.get(f"/orders/{order_id}").json()["Status"] == "Packed"


def test_solving_the_same_order_twice_does_not_create_another():
    order_id = create_order([an_item()])
    first = client.post(f"/orders/{order_id}/solve")
    second = client.post(f"/orders/{order_id}/solve")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["order_id"] == order_id
    assert second.json()["order_id"] == order_id
    assert [order["OrderId"] for order in client.get("/orders").json()] == [order_id]


def test_quantity_three_yields_three_placements():
    order_id = create_order([an_item("MUG", Quantity=3)])
    document = client.post(f"/orders/{order_id}/solve").json()

    placed = [p["item_ref"] for c in document["cartons"] for p in c["placements"]]
    assert placed == ["MUG", "MUG", "MUG"]
    assert client.get(f"/orders/{order_id}").json()["Items"][0]["Quantity"] == 3
    assert client.get(f"/orders/{order_id}").json()["Items"][0]["ItemCode"] == "MUG"


def test_health_still_works():
    assert client.get("/health").json() == {"status": "ok"}
