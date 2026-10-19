"""Atomic Box Inventory import and reconciliation API behaviour."""

import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import BoxType, Role
from tests.auth_helpers import auth_headers

client = TestClient(app)

USER_HEADERS = auth_headers(Role.USER)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)
ADMINISTRATOR_HEADERS = auth_headers(Role.ADMINISTRATOR)

BOX_S = {
    "Reference": "BOX-S",
    "Width": 220,
    "Length": 160,
    "Depth": 120,
    "MaxWeight": 15,
    "BoxWeight": 0.12,
    "Active": True,
    "MaximumBoxes": 12,
}
BOX_M = {
    "Reference": "BOX-M",
    "Width": 320,
    "Length": 240,
    "Depth": 180,
    "MaxWeight": 25,
    "BoxWeight": 0.21,
    "Active": True,
    "MaximumBoxes": 20,
}
BOX_XL = {
    "Reference": "BOX-XL",
    "Width": 600,
    "Length": 500,
    "Depth": 400,
    "MaxWeight": 40,
    "BoxWeight": 0.5,
    "Active": True,
    "MaximumBoxes": 5,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    yield
    store.reset()


def import_boxes(payload: list[dict], headers=SUPERVISOR_HEADERS):
    return client.post("/boxes/import", json={"Boxes": payload}, headers=headers)


def test_fresh_inventory_is_empty():
    assert client.get("/boxes", headers=USER_HEADERS).json() == []


def test_supervisor_imports_valid_initial_inventory():
    response = import_boxes([BOX_S, BOX_M])

    assert response.status_code == 200
    assert response.json()["Imported"] == 2
    assert response.json()["Boxes"] == [BOX_S, BOX_M]
    assert client.get("/boxes", headers=USER_HEADERS).json() == [BOX_S, BOX_M]


def test_administrator_can_import():
    response = import_boxes([BOX_XL], ADMINISTRATOR_HEADERS)

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-XL") == BoxType(**BOX_XL)


def test_user_cannot_import():
    response = import_boxes([BOX_S], USER_HEADERS)

    assert response.status_code == 403
    assert boxes.list_box_types() == []


def test_duplicate_references_are_rejected_without_mutation():
    response = import_boxes([BOX_S, {**BOX_S, "MaximumBoxes": 99}])

    assert response.status_code == 422
    assert "Duplicate box Reference" in response.text
    assert boxes.list_box_types() == []


def test_invalid_record_in_mixed_import_rejects_every_record():
    response = import_boxes([BOX_S, {**BOX_M, "Width": 0}])

    assert response.status_code == 422
    assert boxes.list_box_types() == []


def test_import_creates_new_and_replaces_existing_result_values():
    boxes.add_box_type(BoxType(**BOX_S))
    boxes.add_box_type(BoxType(**BOX_M))
    reviewed_box_s = {**BOX_S, "Width": 225, "MaximumBoxes": 18}

    response = import_boxes([reviewed_box_s, BOX_XL])

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-S") == BoxType(**reviewed_box_s)
    assert boxes.find_box_type("BOX-XL") == BoxType(**BOX_XL)
    assert boxes.find_box_type("BOX-M") == BoxType(**BOX_M)


def test_import_quantity_is_resulting_value_not_an_increment():
    boxes.add_box_type(BoxType(**BOX_S))

    response = import_boxes([{**BOX_S, "MaximumBoxes": 20}])

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-S").maximum_boxes == 20


def test_mixed_calculated_stock_results_are_applied_atomically():
    boxes.add_box_type(BoxType(**BOX_S))
    boxes.add_box_type(BoxType(**{**BOX_M, "MaximumBoxes": 12}))
    replace_result = {**BOX_S, "MaximumBoxes": 20}
    add_result = {**BOX_M, "MaximumBoxes": 32}

    response = import_boxes([replace_result, add_result, BOX_XL])

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-S").maximum_boxes == 20
    assert boxes.find_box_type("BOX-M").maximum_boxes == 32
    assert boxes.find_box_type("BOX-XL") == BoxType(**BOX_XL)


def test_import_accepts_zero_quantity():
    response = import_boxes([{**BOX_XL, "MaximumBoxes": 0}])

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-XL").maximum_boxes == 0


def test_only_imported_active_in_stock_boxes_are_solver_eligible():
    inactive = {**BOX_M, "Active": False}
    zero_stock = {**BOX_XL, "MaximumBoxes": 0}

    assert import_boxes([BOX_S, inactive, zero_stock]).status_code == 200

    assert [box.reference for box in boxes.active_box_types()] == ["BOX-S"]


def test_failed_import_does_not_partially_update_existing_or_create_new():
    boxes.add_box_type(BoxType(**BOX_S))
    desired_existing = {**BOX_S, "MaximumBoxes": 30}
    invalid_new = {**BOX_XL, "Depth": -1}

    response = import_boxes([desired_existing, invalid_new])

    assert response.status_code == 422
    assert boxes.find_box_type("BOX-S") == BoxType(**BOX_S)
    assert boxes.find_box_type("BOX-XL") is None


def test_empty_confirmed_import_is_rejected():
    response = import_boxes([])

    assert response.status_code == 422
    assert boxes.list_box_types() == []


def test_boxes_without_maximum_boxes_import_with_no_limit():
    client_box = {key: value for key, value in BOX_S.items() if key != "MaximumBoxes"}

    response = import_boxes([client_box])

    assert response.status_code == 200
    assert response.json()["Boxes"][0]["MaximumBoxes"] is None
    assert boxes.find_box_type("BOX-S").maximum_boxes is None
    assert [box.reference for box in boxes.active_box_types()] == ["BOX-S"]


def test_import_can_remove_an_existing_quantity_limit():
    boxes.add_box_type(BoxType(**BOX_S))

    response = import_boxes([{**BOX_S, "MaximumBoxes": None}])

    assert response.status_code == 200
    assert boxes.find_box_type("BOX-S").maximum_boxes is None


def test_import_without_active_defaults_to_true():
    imported = {key: value for key, value in BOX_XL.items() if key != "Active"}

    assert import_boxes([imported]).status_code == 200

    assert boxes.find_box_type("BOX-XL").active is True


def test_import_keeps_explicit_active_false():
    assert import_boxes([{**BOX_XL, "Active": False}]).status_code == 200

    assert boxes.find_box_type("BOX-XL").active is False


def test_import_rejects_a_stock_field():
    response = import_boxes([{**BOX_S, "Stock": 5}])

    assert response.status_code == 422
    assert boxes.list_box_types() == []
