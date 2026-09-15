"""Box Inventory API, authorisation, and stored inventory behaviour."""

import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import BoxType, BoxTypeUpdate, Role
from tests.auth_helpers import auth_headers

client = TestClient(app)

USER_HEADERS = auth_headers(Role.USER)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
ADMINISTRATOR_HEADERS = auth_headers(Role.ADMINISTRATOR)

NEW_BOX = {
    "Reference": "BOX-XL",
    "Width": 600,
    "Length": 500,
    "Depth": 400,
    "MaxWeight": 40,
    "BoxWeight": 0.5,
    "Active": True,
    "MaximumBoxes": 20,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    yield
    store.reset()


def editable(box: dict, **overrides) -> dict:
    payload = {key: value for key, value in box.items() if key != "Reference"}
    payload.update(overrides)
    return payload


@pytest.mark.parametrize(
    "headers", [USER_HEADERS, SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS]
)
def test_all_roles_can_list_fresh_empty_inventory(headers):
    response = client.get("/boxes", headers=headers)

    assert response.status_code == 200
    assert response.json() == []


def test_all_inventory_records_include_inactive_and_zero_stock():
    box = BoxType(**{**NEW_BOX, "Active": False, "MaximumBoxes": 0})
    boxes.add_box_type(box)

    response = client.get("/boxes", headers=USER_HEADERS)

    assert response.status_code == 200
    assert response.json()[-1]["Reference"] == "BOX-XL"
    assert response.json()[-1]["Active"] is False
    assert response.json()[-1]["MaximumBoxes"] == 0


def test_user_can_retrieve_a_box_type():
    boxes.add_box_type(BoxType(**NEW_BOX))
    response = client.get("/boxes/BOX-XL", headers=USER_HEADERS)

    assert response.status_code == 200
    assert response.json()["Reference"] == "BOX-XL"


def test_unknown_box_type_is_a_404():
    response = client.get("/boxes/UNKNOWN", headers=USER_HEADERS)

    assert response.status_code == 404


def test_user_cannot_add_a_box_type():
    response = client.post("/boxes", json=NEW_BOX, headers=USER_HEADERS)

    assert response.status_code == 403


@pytest.mark.parametrize("headers", [SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS])
def test_inventory_managers_can_add_a_box_type(headers):
    response = client.post("/boxes", json=NEW_BOX, headers=headers)

    assert response.status_code == 201
    assert response.json() == NEW_BOX
    assert client.get("/boxes/BOX-XL", headers=USER_HEADERS).json() == NEW_BOX


def test_duplicate_reference_is_rejected():
    assert client.post(
        "/boxes", json=NEW_BOX, headers=SUPERVISOR_HEADERS
    ).status_code == 201

    response = client.post("/boxes", json=NEW_BOX, headers=SUPERVISOR_HEADERS)

    assert response.status_code == 409


def test_zero_quantity_is_valid_on_create():
    response = client.post(
        "/boxes", json={**NEW_BOX, "MaximumBoxes": 0}, headers=SUPERVISOR_HEADERS
    )

    assert response.status_code == 201
    assert response.json()["MaximumBoxes"] == 0


def test_user_cannot_update_a_box_type():
    boxes.add_box_type(BoxType(**NEW_BOX))
    current = client.get("/boxes/BOX-XL", headers=USER_HEADERS).json()

    response = client.put(
        "/boxes/BOX-XL",
        json=editable(current, MaximumBoxes=12),
        headers=USER_HEADERS,
    )

    assert response.status_code == 403
    assert client.get("/boxes/BOX-XL", headers=USER_HEADERS).json()["MaximumBoxes"] == 20


def test_supervisor_can_replace_editable_box_fields_and_set_zero_quantity():
    boxes.add_box_type(BoxType(**NEW_BOX))
    current = client.get("/boxes/BOX-XL", headers=USER_HEADERS).json()

    response = client.put(
        "/boxes/BOX-XL",
        json=editable(current, Width=225, Active=False, MaximumBoxes=0),
        headers=SUPERVISOR_HEADERS,
    )

    assert response.status_code == 200
    assert response.json()["Reference"] == "BOX-XL"
    assert response.json()["Width"] == 225
    assert response.json()["Active"] is False
    assert response.json()["MaximumBoxes"] == 0


def test_update_cannot_change_reference():
    boxes.add_box_type(BoxType(**NEW_BOX))
    current = client.get("/boxes/BOX-XL", headers=USER_HEADERS).json()

    response = client.put(
        "/boxes/BOX-XL",
        json={**editable(current), "Reference": "BOX-RENAMED"},
        headers=SUPERVISOR_HEADERS,
    )

    assert response.status_code == 422
    assert client.get("/boxes/BOX-XL", headers=USER_HEADERS).status_code == 200
    assert client.get("/boxes/BOX-RENAMED", headers=USER_HEADERS).status_code == 404


def test_updating_unknown_reference_is_a_404():
    response = client.put(
        "/boxes/UNKNOWN",
        json=editable(NEW_BOX),
        headers=SUPERVISOR_HEADERS,
    )

    assert response.status_code == 404


def test_store_persists_changes_until_reset():
    boxes.add_box_type(BoxType(**NEW_BOX))
    changes = BoxTypeUpdate(**editable(NEW_BOX, MaximumBoxes=7))
    boxes.update_box_type("BOX-XL", changes)

    assert boxes.find_box_type("BOX-XL").maximum_boxes == 7

    store.reset()

    assert boxes.find_box_type("BOX-XL") is None
    assert boxes.list_box_types() == []


def test_missing_maximum_boxes_is_stored_as_no_limit():
    payload = {key: value for key, value in NEW_BOX.items() if key != "MaximumBoxes"}

    response = client.post("/boxes", json=payload, headers=SUPERVISOR_HEADERS)

    assert response.status_code == 201
    assert response.json()["MaximumBoxes"] is None
    assert boxes.find_box_type("BOX-XL").maximum_boxes is None


def test_update_can_set_and_remove_a_quantity_limit():
    created = client.post("/boxes", json=NEW_BOX, headers=SUPERVISOR_HEADERS).json()

    unlimited = client.put(
        "/boxes/BOX-XL", json=editable(created, MaximumBoxes=None),
        headers=SUPERVISOR_HEADERS,
    )
    assert unlimited.status_code == 200
    assert unlimited.json()["MaximumBoxes"] is None

    limited = client.put(
        "/boxes/BOX-XL", json=editable(created, MaximumBoxes=3),
        headers=SUPERVISOR_HEADERS,
    )
    assert limited.json()["MaximumBoxes"] == 3


def test_negative_maximum_boxes_is_rejected():
    response = client.post(
        "/boxes", json={**NEW_BOX, "MaximumBoxes": -1}, headers=SUPERVISOR_HEADERS
    )

    assert response.status_code == 422
    assert boxes.find_box_type("BOX-XL") is None


def test_stock_is_not_a_box_field():
    response = client.post(
        "/boxes", json={**NEW_BOX, "Stock": 5}, headers=SUPERVISOR_HEADERS
    )

    assert response.status_code == 422


@pytest.mark.parametrize("headers", [SUPERVISOR_HEADERS, ADMINISTRATOR_HEADERS])
def test_inventory_managers_can_delete_a_box_type(headers):
    boxes.add_box_type(BoxType(**NEW_BOX))

    response = client.delete("/boxes/BOX-XL", headers=headers)

    assert response.status_code == 204
    assert response.content == b""
    assert client.get("/boxes/BOX-XL", headers=USER_HEADERS).status_code == 404
    assert client.get("/boxes", headers=USER_HEADERS).json() == []


def test_user_cannot_delete_a_box_type():
    boxes.add_box_type(BoxType(**NEW_BOX))

    response = client.delete("/boxes/BOX-XL", headers=USER_HEADERS)

    assert response.status_code == 403
    assert boxes.find_box_type("BOX-XL") is not None


def test_deleting_an_unknown_box_type_is_a_404():
    response = client.delete("/boxes/UNKNOWN", headers=SUPERVISOR_HEADERS)

    assert response.status_code == 404
    assert response.json()["detail"] == "Box type not found"


def test_deleting_only_removes_the_named_box_type():
    boxes.add_box_type(BoxType(**NEW_BOX))
    boxes.add_box_type(BoxType(**{**NEW_BOX, "Reference": "BOX-KEEP"}))

    assert client.delete("/boxes/BOX-XL", headers=SUPERVISOR_HEADERS).status_code == 204

    assert [box.reference for box in boxes.list_box_types()] == ["BOX-KEEP"]
    assert [box.reference for box in boxes.active_box_types()] == ["BOX-KEEP"]


def test_a_deleted_reference_can_be_added_again():
    boxes.add_box_type(BoxType(**NEW_BOX))
    assert client.delete("/boxes/BOX-XL", headers=SUPERVISOR_HEADERS).status_code == 204

    response = client.post("/boxes", json=NEW_BOX, headers=SUPERVISOR_HEADERS)

    assert response.status_code == 201
    assert response.json() == NEW_BOX
