"""Solve routes: status codes, summary shape, box catalogue."""

from __future__ import annotations

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from fitsolver import portal

from app import boxes, store
from app.boxes import active_box_types
from app.main import app
from app.models import BoxTypeUpdate, Role
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
ADMINISTRATOR_HEADERS = auth_headers(Role.ADMINISTRATOR)
USER_HEADERS = auth_headers(Role.USER)
NO_AVAILABLE_BOXES_DETAIL = (
    "No available box types. Add or import at least one active box with available "
    "quantity before running optimisation."
)


@pytest.fixture(autouse=True)
def clear_store():
    store.reset()
    for box in DEFAULT_BOX_TYPES:
        boxes.add_box_type(box)
    yield
    store.reset()


def an_item(code="ITM-001", **overrides) -> dict:
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


def submit_order(order_id: str) -> None:
    response = client.post(f"/orders/{order_id}/submit")
    assert response.status_code == 200, response.text


def solve(order_id: str, headers=SUPERVISOR_HEADERS):
    return client.post(f"/orders/{order_id}/solve", headers=headers)


def update_inventory(reference: str, **overrides) -> None:
    current = boxes.find_box_type(reference)
    payload = current.model_dump(by_alias=True)
    payload.pop("Reference")
    payload.update(overrides)
    boxes.update_box_type(reference, BoxTypeUpdate(**payload))


def test_solving_returns_a_solution_document():
    order_id = create_order([an_item()])
    submit_order(order_id)
    response = solve(order_id)

    assert response.status_code == 200, response.text
    document = response.json()
    assert document["order_id"] == order_id
    assert document["schema_version"] == "1.0.0"


def test_user_cannot_run_solver_even_when_order_is_awaiting():
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = solve(order_id, USER_HEADERS)

    assert response.status_code == 403
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"


def test_administrator_can_run_solver():
    order_id = create_order([an_item()])
    submit_order(order_id)

    assert solve(order_id, ADMINISTRATOR_HEADERS).status_code == 200


def test_solver_requires_authentication():
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = client.post(
        f"/orders/{order_id}/solve", headers={"Authorization": ""}
    )

    assert response.status_code == 401


def test_solver_rejects_an_invalid_token():
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = solve(order_id, {"Authorization": "Bearer invalid"})

    assert response.status_code == 401


def test_solving_an_unknown_order_is_a_404():
    response = solve("ORD-9999")
    assert response.status_code == 404
    assert response.json()["detail"] == "Order not found"


def test_reading_a_solution_before_solving_is_a_404():
    order_id = create_order([an_item()])
    response = client.get(f"/orders/{order_id}/solution")
    assert response.status_code == 404
    assert "has not been solved" in response.json()["detail"]


def test_the_solution_is_stored_and_read_back_unchanged():
    order_id = create_order([an_item()])
    submit_order(order_id)
    solved = solve(order_id).json()
    assert client.get(f"/orders/{order_id}/solution").json() == solved


def test_summary_reports_kilograms_for_the_order_page():
    order_id = create_order([an_item(Weight=2.5)])
    submit_order(order_id)
    solve(order_id)

    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["OrderId"] == order_id
    assert summary["BoxCount"] == 1
    assert summary["Boxes"][0]["ContentsWeightKg"] == pytest.approx(2.5, abs=0.001)
    assert summary["Rejected"] == []


def test_summary_lists_rejected_items_for_the_packer():
    order_id = create_order([an_item("ITM-999", Width=1200, Length=800, Depth=1000, Weight=32.0)])
    submit_order(order_id)
    solve(order_id)

    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["BoxCount"] == 0
    assert summary["Rejected"][0]["ItemCode"] == "ITM-999"
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


def test_solver_fixtures_are_active_and_available_to_the_solver():
    assert all(box.active for box in active_box_types())
    assert len(active_box_types()) == len(DEFAULT_BOX_TYPES)


def test_empty_inventory_supplies_no_boxes_and_solve_returns_conflict():
    order_id = create_order([an_item()])
    submit_order(order_id)
    boxes.reset_box_inventory()

    assert active_box_types() == []
    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == NO_AVAILABLE_BOXES_DETAIL
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"


def test_all_inactive_inventory_returns_clear_conflict():
    for box in boxes.list_box_types():
        update_inventory(box.reference, Active=False)
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == NO_AVAILABLE_BOXES_DETAIL
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"


def test_all_active_zero_stock_inventory_returns_clear_conflict():
    for box in boxes.list_box_types():
        update_inventory(box.reference, Active=True, MaximumBoxes=0)
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == NO_AVAILABLE_BOXES_DETAIL
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"


def test_one_active_in_stock_box_allows_optimisation():
    boxes.reset_box_inventory()
    boxes.add_box_type(DEFAULT_BOX_TYPES[0])
    order_id = create_order([an_item()])
    submit_order(order_id)

    response = solve(order_id)

    assert response.status_code == 200
    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"


def test_inactive_and_zero_stock_boxes_are_not_supplied_to_the_solver():
    update_inventory("BOX-M", Active=False)
    update_inventory("BOX-L", MaximumBoxes=0)

    available = active_box_types()

    assert [box.reference for box in available] == ["BOX-S"]


def test_solving_does_not_change_inventory_quantities():
    update_inventory("BOX-S", MaximumBoxes=3)
    before = {
        box.reference: box.maximum_boxes for box in boxes.list_box_types()
    }
    order_id = create_order([an_item()])
    submit_order(order_id)

    assert solve(order_id).status_code == 200

    after = {
        box.reference: box.maximum_boxes for box in boxes.list_box_types()
    }
    assert after == before


def test_boxes_with_no_quantity_limit_are_supplied_to_the_solver():
    update_inventory("BOX-S", MaximumBoxes=None)
    update_inventory("BOX-M", MaximumBoxes=0)
    update_inventory("BOX-L", Active=False, MaximumBoxes=None)

    assert [
        (box.reference, box.maximum_boxes) for box in active_box_types()
    ] == [("BOX-S", None)]


def test_solver_request_carries_maximum_boxes(monkeypatch):
    update_inventory("BOX-S", MaximumBoxes=5)
    update_inventory("BOX-M", MaximumBoxes=None)
    update_inventory("BOX-L", MaximumBoxes=0)
    order_id = create_order([an_item()])
    submit_order(order_id)
    captured_request = None

    def capture_solver(request):
        nonlocal captured_request
        captured_request = deepcopy(request)
        return {"order_id": order_id, "cartons": [], "rejects": []}

    monkeypatch.setattr("app.routes.solve.solve_request", capture_solver)

    assert solve(order_id).status_code == 200
    assert [
        (carton["sku"], carton["maximum_boxes"]) for carton in captured_request["cartons"]
    ] == [("BOX-S", 5), ("BOX-M", None)]


def test_draft_order_cannot_be_solved():
    order_id = create_order([an_item()])

    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "Only orders awaiting optimisation or already optimised can be solved"
    )
    assert client.get(f"/orders/{order_id}").json()["Status"] == "DRAFT"


def test_solving_marks_awaiting_order_as_optimised():
    order_id = create_order([an_item()])
    submit_order(order_id)
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"

    solve(order_id)

    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"


def test_supervisor_can_reoptimise_and_replace_the_active_solution():
    order_id = create_order([an_item()])
    submit_order(order_id)
    first = solve(order_id).json()
    second = solve(order_id).json()

    assert first["solution_id"] != second["solution_id"]
    assert client.get(f"/orders/{order_id}/solution").json() == second
    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"
    assert [order["OrderId"] for order in client.get("/orders").json()] == [order_id]


def test_administrator_can_reoptimise_and_order_remains_optimised():
    order_id = create_order([an_item()])
    submit_order(order_id)
    assert solve(order_id).status_code == 200

    response = solve(order_id, ADMINISTRATOR_HEADERS)

    assert response.status_code == 200
    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"


def test_user_cannot_reoptimise_but_can_read_solution_and_summary():
    order_id = create_order([an_item()])
    submit_order(order_id)
    original = solve(order_id).json()

    response = solve(order_id, USER_HEADERS)

    assert response.status_code == 403
    assert client.get(f"/orders/{order_id}/solution").json() == original
    assert client.get(f"/orders/{order_id}/solution/summary").status_code == 200


def test_failed_reoptimisation_preserves_solution_and_status(monkeypatch):
    order_id = create_order([an_item()])
    submit_order(order_id)
    original = solve(order_id).json()

    def fail_solver(_request):
        raise RuntimeError("temporary failure")

    monkeypatch.setattr("app.routes.solve.solve_request", fail_solver)
    response = solve(order_id)

    assert response.status_code == 500
    assert client.get(f"/orders/{order_id}/solution").json() == original
    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"


@pytest.mark.parametrize(
    "inventory_change",
    [
        lambda: boxes.reset_box_inventory(),
        lambda: [
            update_inventory(box.reference, Active=False)
            for box in boxes.list_box_types()
        ],
        lambda: [
            update_inventory(box.reference, Active=True, MaximumBoxes=0)
            for box in boxes.list_box_types()
        ],
    ],
    ids=["empty", "inactive-only", "zero-stock-only"],
)
def test_unavailable_inventory_preserves_previous_optimisation(inventory_change):
    order_id = create_order([an_item()])
    submit_order(order_id)
    original = solve(order_id).json()
    inventory_change()

    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == NO_AVAILABLE_BOXES_DETAIL
    assert client.get(f"/orders/{order_id}/solution").json() == original
    assert client.get(f"/orders/{order_id}").json()["Status"] == "OPTIMISED"


def test_reoptimisation_uses_current_eligible_inventory(monkeypatch):
    order_id = create_order([an_item()])
    submit_order(order_id)
    original = solve(order_id).json()
    boxes.reset_box_inventory()
    boxes.add_box_type(DEFAULT_BOX_TYPES[1])
    captured_request = None

    def capture_solver(request):
        nonlocal captured_request
        captured_request = deepcopy(request)
        return {**original, "solution_id": "replacement-solution"}

    monkeypatch.setattr("app.routes.solve.solve_request", capture_solver)

    assert solve(order_id).status_code == 200
    assert [carton["sku"] for carton in captured_request["cartons"]] == ["BOX-M"]
    assert store.find_solution(order_id)["solution_id"] == "replacement-solution"


def test_solution_exposes_box_placements_and_rejects_to_all_viewers():
    order_id = create_order([
        an_item("ITM-001", ItemReference="SKU-PACKED", Quantity=2),
        an_item(
            "ITM-999",
            ItemReference="SKU-TOO-LARGE",
            Width=1200,
            Length=800,
            Depth=1000,
            Weight=32.0,
        ),
    ])
    submit_order(order_id)
    solve(order_id)

    document = client.get(f"/orders/{order_id}/solution", headers=USER_HEADERS).json()

    assert document["cartons"][0]["sku"].startswith("BOX-")
    assert [placement["item_ref"] for placement in document["cartons"][0]["placements"]] == [
        "ITM-001",
        "ITM-001",
    ]
    assert document["cartons"][0]["placements"][0]["label"] == "SKU-PACKED"
    assert document["cartons"][0]["placements"][0]["position"] == [0, 0, 0]
    assert len(document["cartons"][0]["placements"][0]["dims"]) == 3
    assert isinstance(document["cartons"][0]["placements"][0]["orientation"], int)
    assert document["rejects"][0]["item_ref"] == "ITM-999"


def test_quantity_three_yields_three_placements():
    order_id = create_order([an_item("ITM-001", Quantity=3)])
    submit_order(order_id)
    document = solve(order_id).json()

    placed = [p["item_ref"] for c in document["cartons"] for p in c["placements"]]
    assert placed == ["ITM-001", "ITM-001", "ITM-001"]
    assert client.get(f"/orders/{order_id}").json()["Items"][0]["Quantity"] == 3
    assert client.get(f"/orders/{order_id}").json()["Items"][0]["ItemCode"] == "ITM-001"


def test_health_still_works():
    assert client.get("/health").json() == {"status": "ok"}
