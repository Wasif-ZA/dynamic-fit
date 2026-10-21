"""Solve routes: status codes, summary shape, box catalogue."""

from __future__ import annotations

from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from fitsolver import io, portal

from app import boxes, database, store
from app.boxes import active_box_types
from app.main import app
from app.models import BoxType, BoxTypeUpdate, Role
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
    order_id = create_order([an_item("ITM-999", Width=1200, Length=800, Depth=1000, Weight=31.62)])
    submit_order(order_id)
    solve(order_id)

    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["BoxCount"] == 0
    assert summary["Rejected"][0]["ItemCode"] == "ITM-999"
    assert summary["Rejected"][0]["Reason"] == "NO_FITTING_CARTON"
    assert summary["Rejected"][0]["Detail"]


@pytest.mark.parametrize("include_packed_item", [False, True])
def test_order_list_and_detail_report_rejected_units(include_packed_item):
    items = [an_item("OVERSIZED", Width=1200, Length=800, Depth=1000, Quantity=3)]
    if include_packed_item:
        items.append(an_item())
    order_id = create_order(items)
    submit_order(order_id)
    other_id = create_order([an_item("OTHER")])

    response = solve(order_id)

    assert response.status_code == 200, response.text
    assert len(response.json()["rejects"]) == 3
    assert bool(response.json()["cartons"]) == include_packed_item
    database.dispose_engine()
    detail = client.get(f"/orders/{order_id}").json()
    assert detail["Status"] == "OPTIMISED"
    assert detail["RejectedCount"] == 3
    listed = {order["OrderId"]: order for order in client.get("/orders").json()}
    assert listed[order_id] == detail
    assert listed[other_id]["Status"] == "DRAFT"
    assert listed[other_id]["RejectedCount"] == 0


def test_reoptimising_can_add_rejections_to_a_previously_successful_order():
    order_id = create_order([an_item()])
    submit_order(order_id)
    assert solve(order_id).status_code == 200
    assert client.get(f"/orders/{order_id}").json()["RejectedCount"] == 0
    for box in boxes.list_box_types():
        update_inventory(box.reference, Active=False)
    boxes.add_box_type(BoxType(
        Reference="TINY", Width=10, Length=10, Depth=10, MaxWeight=5, BoxWeight=0.1,
    ))

    response = solve(order_id)

    assert response.status_code == 200, response.text
    assert len(response.json()["rejects"]) == 1
    for order in [client.get(f"/orders/{order_id}").json(), *client.get("/orders").json()]:
        assert order["Status"] == "OPTIMISED"
        assert order["RejectedCount"] == 1


def test_reoptimising_clears_rejection_count_when_all_items_fit():
    order_id = create_order([an_item(Width=1200, Length=800, Depth=1000)])
    submit_order(order_id)
    assert solve(order_id).status_code == 200
    assert client.get(f"/orders/{order_id}").json()["RejectedCount"] == 1
    boxes.add_box_type(BoxType(
        Reference="XL", Width=1600, Length=1600, Depth=1600, MaxWeight=100, BoxWeight=1,
    ))

    response = solve(order_id)

    assert response.status_code == 200, response.text
    assert response.json()["rejects"] == []
    for order in [client.get(f"/orders/{order_id}").json(), *client.get("/orders").json()]:
        assert order["Status"] == "OPTIMISED"
        assert order["RejectedCount"] == 0
    finalised = client.post(f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS)
    assert finalised.status_code == 200, finalised.text
    assert finalised.json()["Status"] == "FINAL"
    assert finalised.json()["RejectedCount"] == 0


def test_editing_a_rejected_order_clears_the_rejection_count():
    order_id = create_order([an_item(Width=1200, Length=800, Depth=1000)])
    submit_order(order_id)
    assert solve(order_id).status_code == 200
    assert client.get(f"/orders/{order_id}").json()["RejectedCount"] == 1

    response = client.put(f"/orders/{order_id}", json={"Items": [an_item()]})

    assert response.status_code == 200
    assert response.json()["Status"] == "DRAFT"
    assert response.json()["RejectedCount"] == 0
    assert client.get(f"/orders/{order_id}").json() == response.json()
    assert client.get("/orders").json()[0] == response.json()
    assert client.get(f"/orders/{order_id}/solution").status_code == 404


def test_failed_reoptimisation_preserves_saved_rejection_count(monkeypatch):
    order_id = create_order([an_item(Width=1200, Length=800, Depth=1000, Quantity=2)])
    submit_order(order_id)
    assert solve(order_id).status_code == 200

    def fail(_request):
        raise RuntimeError("Solver unavailable")

    monkeypatch.setattr("app.routes.solve.solve_request", fail)

    assert solve(order_id).status_code == 500
    for order in [client.get(f"/orders/{order_id}").json(), *client.get("/orders").json()]:
        assert order["Status"] == "OPTIMISED"
        assert order["RejectedCount"] == 2


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


@pytest.mark.parametrize("headers", [SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS])
def test_manager_can_optimise_a_draft_directly_without_consuming_inventory(headers):
    order_id = create_order([an_item()])
    original = client.get(f"/orders/{order_id}").json()
    inventory_before = client.get("/boxes").json()

    response = solve(order_id, headers)

    assert response.status_code == 200, response.text
    assert response.json()["rejects"] == []
    updated = client.get(f"/orders/{order_id}").json()
    packed = response.json()['cartons']
    max_weight = max((carton['contents_mass'] + carton.get('tare_mass', 0)) / 1000 for carton in packed)
    assert updated == {**original, "Status": "OPTIMISED", "MaxPackedWeightKg": max_weight}
    assert client.get(f"/orders/{order_id}/solution").json() == response.json()
    assert client.get("/orders").json()[0] == updated
    assert client.get("/boxes").json() == inventory_before


def test_regular_user_cannot_optimise_a_draft_even_with_elevated_token_metadata(monkeypatch):
    order_id = create_order([an_item()])

    def must_not_solve(_request):
        pytest.fail("A regular User must not execute Solver")

    monkeypatch.setattr("app.routes.solve.solve_request", must_not_solve)
    headers = auth_headers(Role.USER, extra_claims={
        "user_metadata": {"role": "ADMINISTRATOR"},
        "app_metadata": {"role": "SUPERVISOR"},
    })

    response = solve(order_id, headers)

    assert response.status_code == 403
    assert client.get(f"/orders/{order_id}").json()["Status"] == "DRAFT"
    assert store.find_solution(order_id) is None
    submit_order(order_id)
    assert client.get(f"/orders/{order_id}").json()["Status"] == "AWAITING_OPTIMISATION"


@pytest.mark.parametrize("headers", [SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS])
@pytest.mark.parametrize(
    "error, expected_status",
    [(RuntimeError("Solver unavailable"), 500), (io.RequestError("Invalid request"), 422)],
)
def test_failed_direct_optimisation_preserves_the_draft(monkeypatch, headers, error, expected_status):
    order_id = create_order([an_item()])
    original = client.get(f"/orders/{order_id}").json()

    def fail_solver(_request):
        raise error

    monkeypatch.setattr("app.routes.solve.solve_request", fail_solver)

    response = solve(order_id, headers)

    assert response.status_code == expected_status
    assert client.get(f"/orders/{order_id}").json() == original
    assert store.find_solution(order_id) is None


def test_direct_optimisation_without_available_boxes_preserves_the_draft():
    order_id = create_order([an_item()])
    original = client.get(f"/orders/{order_id}").json()
    boxes.reset_box_inventory()

    response = solve(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == NO_AVAILABLE_BOXES_DETAIL
    assert client.get(f"/orders/{order_id}").json() == original
    assert store.find_solution(order_id) is None


def test_direct_optimisation_with_rejected_items_saves_the_rejection_result():
    order_id = create_order([an_item(Width=1200, Length=800, Depth=1000, Quantity=2)])

    response = solve(order_id)

    assert response.status_code == 200, response.text
    assert len(response.json()["rejects"]) == 2
    updated = client.get(f"/orders/{order_id}").json()
    assert updated["Status"] == "OPTIMISED"
    assert updated["RejectedCount"] == 2


@pytest.mark.parametrize("initial_status", ["DRAFT", "AWAITING_OPTIMISATION", "OPTIMISED"])
def test_editing_items_during_optimisation_discards_the_stale_result(monkeypatch, initial_status):
    order_id = create_order([an_item()])
    if initial_status != "DRAFT":
        submit_order(order_id)
    if initial_status == "OPTIMISED":
        assert solve(order_id).status_code == 200
    new_items = [an_item("CHANGED", Quantity=2)]

    def edit_during_solve(_request):
        assert client.put(f"/orders/{order_id}", json={"Items": new_items}).status_code == 200
        return {"order_id": order_id, "cartons": [], "rejects": []}

    monkeypatch.setattr("app.routes.solve.solve_request", edit_during_solve)

    response = solve(order_id)

    assert response.status_code == 409
    assert "edited during optimisation" in response.json()["detail"]
    updated = client.get(f"/orders/{order_id}").json()
    assert updated["Status"] == "DRAFT"
    assert updated["Items"][0]["ItemCode"] == "CHANGED"
    assert updated["Items"][0]["Quantity"] == 2
    assert store.find_solution(order_id) is None


def test_a_final_order_cannot_be_overwritten_by_an_in_flight_optimisation(monkeypatch):
    order_id = create_order([an_item()])
    original = solve(order_id).json()

    def finalise_during_solve(_request):
        response = client.post(f"/orders/{order_id}/finalise", headers=SUPERVISOR_HEADERS)
        assert response.status_code == 200, response.text
        return {**original, "solution_id": "stale-replacement"}

    monkeypatch.setattr("app.routes.solve.solve_request", finalise_during_solve)

    response = solve(order_id)

    assert response.status_code == 409
    assert client.get(f"/orders/{order_id}").json()["Status"] == "FINAL"
    assert store.find_solution(order_id) == original


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
            Weight=31.62,
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
