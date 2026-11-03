"""The pick packer's Done or Cancel from the Visualiser, recorded on finalised orders."""

import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import Role
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
MANAGER = auth_headers(Role.SUPERVISOR)
USER = auth_headers(Role.USER)
ITEM = {
    "ItemCode": "PACK-TEST", "ItemReference": "Packing test item",
    "Width": 100, "Length": 100, "Depth": 100, "Weight": 1,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    for box in DEFAULT_BOX_TYPES:
        boxes.add_box_type(box)
    yield
    store.reset()


def create_order(status):
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    if status in {"OPTIMISED", "FINAL"}:
        assert client.post(f"/orders/{order_id}/solve", headers=MANAGER).status_code == 200
    if status == "FINAL":
        assert client.post(f"/orders/{order_id}/finalise", headers=MANAGER).status_code == 200
    return order_id


def record(order_id, complete, headers=USER):
    return client.post(f"/orders/{order_id}/packing", json={"Complete": complete}, headers=headers)


def test_new_and_finalised_orders_start_with_no_packing_result():
    order = client.get(f"/orders/{create_order('FINAL')}").json()
    assert "PackingStatus" not in order
    assert "PackingUpdatedAt" not in order


@pytest.mark.parametrize(("complete", "status"), [(True, "PACKED"), (False, "INCOMPLETE")])
def test_any_signed_in_user_can_record_done_or_cancel_on_a_finalised_order(complete, status):
    order_id = create_order("FINAL")

    response = record(order_id, complete)

    assert response.status_code == 200, response.text
    assert response.json()["PackingStatus"] == status
    assert response.json()["PackingUpdatedAt"]
    assert response.json()["Status"] == "FINAL"
    assert client.get(f"/orders/{order_id}").json()["PackingStatus"] == status


def test_done_after_cancel_marks_the_order_packed():
    order_id = create_order("FINAL")
    assert record(order_id, False).json()["PackingStatus"] == "INCOMPLETE"
    assert record(order_id, True).json()["PackingStatus"] == "PACKED"


def test_packing_status_appears_in_the_orders_list():
    order_id = create_order("FINAL")
    record(order_id, True)
    listed = {order["OrderId"]: order for order in client.get("/orders").json()}
    assert listed[order_id]["PackingStatus"] == "PACKED"


@pytest.mark.parametrize("status", ["DRAFT", "OPTIMISED"])
def test_unfinalised_orders_cannot_be_marked_packed(status):
    order_id = create_order(status)

    response = record(order_id, True)

    assert response.status_code == 409
    assert "Finalise the order first" in response.json()["detail"]
    assert "PackingStatus" not in client.get(f"/orders/{order_id}").json()


def test_archived_orders_are_read_only_for_packing():
    order_id = create_order("FINAL")
    assert client.post(f"/orders/{order_id}/archive", headers=MANAGER).status_code == 200

    assert record(order_id, True).status_code == 409


def test_unknown_orders_are_not_found():
    assert record("ORD-999", True).status_code == 404


def test_the_result_must_say_whether_packing_was_complete():
    order_id = create_order("FINAL")
    response = client.post(f"/orders/{order_id}/packing", json={}, headers=USER)
    assert response.status_code == 422


def test_recording_packing_requires_authentication():
    order_id = create_order("FINAL")
    response = client.post(
        f"/orders/{order_id}/packing", json={"Complete": True}, headers={"Authorization": ""}
    )
    assert response.status_code == 401
