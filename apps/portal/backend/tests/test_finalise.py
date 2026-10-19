"""Order finalisation, atomic stock consumption, and permanent immutability."""

import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import BoxType, Role
from tests.auth_helpers import auth_headers

client = TestClient(app)

SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
ADMINISTRATOR_HEADERS = auth_headers(Role.ADMINISTRATOR)
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


def solution(*references: str, rejects: list[dict] | None = None) -> dict:
    return {
        "solution_id": "approved-solution",
        "order_id": "ORD-001",
        "cartons": [
            {"carton_id": f"c{index}", "sku": reference, "placements": []}
            for index, reference in enumerate(references, start=1)
        ],
        "rejects": rejects or [],
    }


def create_order(status: str = "OPTIMISED", document: dict | None = None) -> str:
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    stored = store.find_order(order_id)
    stored.status = status
    store.update_order(stored)
    if document is not None:
        store.save_solution(order_id, document)
    return order_id


def finalise(order_id: str, headers=SUPERVISOR_HEADERS):
    return client.post(f"/orders/{order_id}/finalise", headers=headers)


@pytest.mark.parametrize("headers", [SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS])
def test_inventory_manager_can_finalise_an_optimised_order(headers):
    add_inventory(MED)
    document = solution("MED", "MED")
    order_id = create_order(document=document)

    response = finalise(order_id, headers)

    assert response.status_code == 200
    assert response.json()["Status"] == "FINAL"
    assert boxes.find_box_type("MED").maximum_boxes == 3
    assert store.find_solution(order_id) == document


def test_user_cannot_finalise():
    add_inventory(MED)
    order_id = create_order(document=solution("MED"))

    response = finalise(order_id, USER_HEADERS)

    assert response.status_code == 403
    assert store.find_order(order_id).status == "OPTIMISED"
    assert boxes.find_box_type("MED").maximum_boxes == 5


@pytest.mark.parametrize("order_status", ["DRAFT", "AWAITING_OPTIMISATION"])
def test_only_optimised_orders_can_be_finalised(order_status):
    order_id = create_order(status=order_status, document=solution("MED"))

    response = finalise(order_id)

    assert response.status_code == 409
    assert response.json()["detail"] == "Only optimised orders can be finalised"


def test_final_order_cannot_be_finalised_again():
    add_inventory(MED)
    order_id = create_order(document=solution("MED"))
    assert finalise(order_id).status_code == 200

    response = finalise(order_id)

    assert response.status_code == 409
    assert boxes.find_box_type("MED").maximum_boxes == 4


def test_missing_active_solution_is_a_404():
    order_id = create_order(document=None)

    response = finalise(order_id)

    assert response.status_code == 404
    assert store.find_order(order_id).status == "OPTIMISED"


def test_unknown_order_is_a_404():
    assert finalise("ORD-404").status_code == 404


def test_rejects_block_finalisation_without_mutating_stock_or_solution():
    add_inventory(MED)
    document = solution(
        "MED",
        rejects=[
            {"item_ref": "ITM-004", "reason_code": "NO_FITTING_CARTON", "message": "Too large"},
            {"item_ref": "ITM-004", "reason_code": "NO_FITTING_CARTON", "message": "Too large"},
        ],
    )
    order_id = create_order(document=document)

    response = finalise(order_id)

    assert response.status_code == 409
    assert "2 item(s) were not packed" in response.json()["detail"]
    assert boxes.find_box_type("MED").maximum_boxes == 5
    assert store.find_order(order_id).status == "OPTIMISED"
    assert store.find_solution(order_id) == document


def test_multiple_carton_types_are_counted_and_deducted_exactly():
    add_inventory(MED, SML)
    order_id = create_order(document=solution("MED", "MED", "SML", "MED"))

    assert finalise(order_id).status_code == 200

    assert boxes.find_box_type("MED").maximum_boxes == 2
    assert boxes.find_box_type("SML").maximum_boxes == 9


def test_stock_may_reach_zero_without_removing_inventory_record():
    add_inventory({**MED, "MaximumBoxes": 2})
    order_id = create_order(document=solution("MED", "MED"))

    assert finalise(order_id).status_code == 200

    assert boxes.find_box_type("MED") is not None
    assert boxes.find_box_type("MED").maximum_boxes == 0
    assert boxes.active_box_types() == []


def test_insufficient_stock_blocks_every_deduction():
    add_inventory(MED, {**SML, "MaximumBoxes": 1})
    document = solution("MED", "MED", "SML", "SML")
    order_id = create_order(document=document)

    response = finalise(order_id)

    assert response.status_code == 409
    assert "requires 2 SML boxes, but only 1 is available" in response.json()["detail"]
    assert boxes.find_box_type("MED").maximum_boxes == 5
    assert boxes.find_box_type("SML").maximum_boxes == 1
    assert store.find_order(order_id).status == "OPTIMISED"
    assert store.find_solution(order_id) == document


def test_all_inventory_problems_are_reported_together():
    add_inventory({**MED, "Active": False})
    order_id = create_order(document=solution("MED", "MISSING"))

    response = finalise(order_id)

    assert response.status_code == 409
    assert "1 MED box, but that box type is inactive" in response.json()["detail"]
    assert "1 MISSING box, but that box type is missing" in response.json()["detail"]
    assert boxes.find_box_type("MED").maximum_boxes == 5


def test_boxes_with_no_quantity_limit_are_never_consumed():
    add_inventory({**MED, "MaximumBoxes": None}, SML)
    order_id = create_order(document=solution("MED", "MED", "MED", "SML"))

    assert finalise(order_id).status_code == 200

    assert boxes.find_box_type("MED").maximum_boxes is None
    assert boxes.find_box_type("SML").maximum_boxes == 9
    assert store.find_order(order_id).status == "FINAL"


def test_deleting_a_box_type_blocks_finalising_a_solution_that_uses_it():
    add_inventory(MED)
    document = solution("MED", "MED")
    order_id = create_order(document=document)

    assert client.delete("/boxes/MED", headers=SUPERVISOR_HEADERS).status_code == 204
    response = finalise(order_id)

    assert response.status_code == 409
    assert "2 MED boxes, but that box type is missing" in response.json()["detail"]
    assert store.find_order(order_id).status == "OPTIMISED"
    assert store.find_solution(order_id) == document


def test_a_final_order_keeps_its_solution_after_its_box_type_is_deleted():
    add_inventory(MED)
    document = solution("MED")
    order_id = create_order(document=document)
    assert finalise(order_id).status_code == 200

    assert client.delete("/boxes/MED", headers=SUPERVISOR_HEADERS).status_code == 204

    assert store.find_order(order_id).status == "FINAL"
    assert client.get(f"/orders/{order_id}/solution").json() == document


def test_final_order_cannot_be_edited_and_solution_is_preserved():
    add_inventory(MED)
    document = solution("MED")
    order_id = create_order(document=document)
    assert finalise(order_id).status_code == 200

    response = client.put(f"/orders/{order_id}", json={"Items": [{**ITEM, "Width": 50}]})

    assert response.status_code == 409
    assert client.get(f"/orders/{order_id}").json()["Items"] == [{
        **ITEM,
        "Quantity": 1,
    }]
    assert store.find_solution(order_id) == document


def test_final_order_cannot_be_solved_or_submitted():
    add_inventory(MED)
    order_id = create_order(document=solution("MED"))
    assert finalise(order_id).status_code == 200

    solve_response = client.post(f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS)
    submit_response = client.post(f"/orders/{order_id}/submit")

    assert solve_response.status_code == 409
    assert submit_response.status_code == 409
    assert store.find_order(order_id).status == "FINAL"


def test_approved_solution_remains_readable_after_finalisation():
    add_inventory(MED)
    document = solution("MED")
    order_id = create_order(document=document)

    assert finalise(order_id).status_code == 200

    assert client.get(f"/orders/{order_id}/solution").json() == document
