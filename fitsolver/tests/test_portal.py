"""Portal translation and HTTP boundary contract tests."""
from __future__ import annotations

import json
import sys
from copy import deepcopy
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# This repository has a src layout but no packaging/test-path configuration.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fitsolver.api import app
from fitsolver.portal import to_contract

CLIENT = TestClient(app)

PORTAL_REQUEST = {
    "order_id": "ORD-001",
    "items": [
        {
            "item_code": "ITM-001",
            "item_reference": "Widget A",
            "width": 100.0,
            "length": 200.0,
            "depth": 50.0,
            "weight": 1.25,
            "box_group": "GROUP-A",
        },
        {
            "item_code": "ITM-002",
            "item_reference": "Widget B",
            "width": 300.0,
            "length": 150.0,
            "depth": 75.0,
            "weight": 2.5,
            "box_group": "GROUP-A",
        },
    ],
    "boxes": [
        {
            "box_reference": "MED",
            "width": 400.0,
            "length": 400.0,
            "depth": 400.0,
            "max_weight": 15.2,
        }
    ],
}


def _post(payload: object):
    return CLIENT.post(
        "/v1/solve/portal",
        content=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )


def test_example_request_packs_both_items_in_one_carton():
    response = _post(PORTAL_REQUEST)

    assert response.status_code == 200
    document = response.json()
    placements = [
        placement
        for carton in document["cartons"]
        for placement in carton["placements"]
    ]
    assert document["metrics"]["carton_count"] == 1
    assert len(placements) == 2
    assert document["rejects"] == []


def test_weights_are_converted_from_kilograms_to_integer_grams():
    contract = to_contract(PORTAL_REQUEST)

    assert [item["mass"] for item in contract["items"]] == [1250, 2500]
    assert contract["cartons"][0]["max_contents_mass"] == 15200


@pytest.mark.parametrize(
    ("tare_weight", "expected_grams"),
    [(None, 0), (1.0, 1000)],
    ids=["absent", "one-kilogram"],
)
def test_tare_weight_defaults_to_zero_and_converts_to_grams(
    tare_weight, expected_grams
):
    payload = deepcopy(PORTAL_REQUEST)
    if tare_weight is not None:
        payload["boxes"][0]["tare_weight"] = tare_weight

    contract = to_contract(payload)

    assert contract["cartons"][0]["tare_mass"] == expected_grams


@pytest.mark.parametrize(
    ("first_group", "second_group", "expected_cartons"),
    [
        ("GROUP-A", "GROUP-B", 2),
        ("GROUP-A", "GROUP-A", 1),
        (None, None, 1),
        (None, "GROUP-A", 1),
        ("", "GROUP-A", 1),
        ("", "", 1),
    ],
    ids=[
        "different-groups",
        "same-group",
        "null-groups",
        "absent-and-grouped",
        "empty-and-grouped",
        "empty-groups",
    ],
)
def test_box_group_controls_carton_segregation(
    first_group, second_group, expected_cartons
):
    payload = deepcopy(PORTAL_REQUEST)
    if first_group is None:
        payload["items"][0].pop("box_group", None)
    else:
        payload["items"][0]["box_group"] = first_group
    if second_group is None:
        payload["items"][1]["box_group"] = None
    else:
        payload["items"][1]["box_group"] = second_group

    response = _post(payload)

    assert response.status_code == 200
    assert response.json()["metrics"]["carton_count"] == expected_cartons


def test_portal_axis_order_is_width_length_depth():
    contract = to_contract(PORTAL_REQUEST)

    assert contract["items"][0]["dims"] == [100, 200, 50]


def test_exact_halves_use_pythons_ties_to_even_rounding():
    payload = deepcopy(PORTAL_REQUEST)
    payload["items"][0]["width"] = 100.5
    payload["items"][0]["weight"] = 0.0005

    item = to_contract(payload)["items"][0]

    # Python rounds an exact .5 to the nearest even integer: 100.5 -> 100
    # and 0.0005 kg -> 0.5 g -> 0.
    assert item["dims"][0] == 100
    assert item["mass"] == 0


def _valid_single_item_request():
    payload = deepcopy(PORTAL_REQUEST)
    payload["items"] = payload["items"][:1]
    return payload


@pytest.mark.parametrize(
    ("mutate", "offending_field"),
    [
        (lambda p: p.pop("order_id"), "order_id"),
        (lambda p: p.update(items="not-a-list"), "items"),
        (lambda p: p.update(items=[]), "items"),
        (lambda p: p.update(boxes=[]), "boxes"),
        (lambda p: p["items"][0].pop("item_code"), "item_code"),
        (lambda p: p["items"][0].update(width="100"), "width"),
        (lambda p: p["items"][0].update(width=True), "width"),
        (lambda p: p["items"][0].update(width=None), "width"),
        (lambda p: p["items"][0].update(width=float("nan")), "width"),
        (lambda p: p["items"][0].update(width=float("inf")), "width"),
    ],
    ids=[
        "missing-order-id",
        "items-not-list",
        "items-empty",
        "boxes-empty",
        "missing-item-code",
        "width-string",
        "width-bool",
        "width-null",
        "width-nan",
        "width-infinity",
    ],
)
def test_malformed_requests_return_422_and_name_the_field(mutate, offending_field):
    payload = _valid_single_item_request()
    mutate(payload)

    response = _post(payload)

    assert response.status_code == 422
    assert offending_field in response.json()["detail"]


def test_huge_json_integer_dimension_returns_422_instead_of_500():
    payload = _valid_single_item_request()
    payload["items"][0]["width"] = 10**400

    response = _post(payload)

    assert response.status_code == 422
    assert "width" in response.json()["detail"]


def test_finite_weight_that_overflows_kg_to_grams_returns_422_instead_of_500():
    payload = _valid_single_item_request()
    payload["items"][0]["weight"] = 1e308

    response = _post(payload)

    assert response.status_code == 422
    assert "weight" in response.json()["detail"]


@pytest.mark.parametrize(
    ("location", "value"),
    [
        ("item_code", None),
        ("item_code", ["ITM-001"]),
        ("item_code", {"code": "ITM-001"}),
        ("box_reference", None),
        ("box_reference", ["MED"]),
        ("box_reference", {"code": "MED"}),
        ("order_id", None),
        ("order_id", ["ORD-001"]),
        ("order_id", {"code": "ORD-001"}),
    ],
    ids=[
        "null-item-code",
        "list-item-code",
        "object-item-code",
        "null-box-reference",
        "list-box-reference",
        "object-box-reference",
        "null-order-id",
        "list-order-id",
        "object-order-id",
    ],
)
def test_non_string_identifiers_return_422(location, value):
    payload = _valid_single_item_request()
    if location == "item_code":
        payload["items"][0][location] = value
    elif location == "box_reference":
        payload["boxes"][0][location] = value
    else:
        payload[location] = value

    response = _post(payload)

    assert response.status_code == 422
    assert location in response.json()["detail"]


@pytest.mark.parametrize("collection", ["items", "boxes"])
def test_non_object_collection_elements_return_422(collection):
    payload = _valid_single_item_request()
    payload[collection][0] = "not-an-object"

    response = _post(payload)

    assert response.status_code == 422
    assert f"{collection}[0]" in response.json()["detail"]


def test_missing_box_max_weight_returns_422():
    payload = _valid_single_item_request()
    payload["boxes"][0].pop("max_weight")

    response = _post(payload)

    assert response.status_code == 422
    assert "max_weight" in response.json()["detail"]


@pytest.mark.parametrize("field", ["max_weight", "tare_weight"])
def test_wrong_type_box_weights_return_422(field):
    payload = _valid_single_item_request()
    payload["boxes"][0][field] = "not-a-number"

    response = _post(payload)

    assert response.status_code == 422
    assert field in response.json()["detail"]


def test_negative_box_weights_return_422_while_negative_item_weight_is_rejected():
    for field in ("max_weight", "tare_weight"):
        payload = _valid_single_item_request()
        payload["boxes"][0][field] = -1

        response = _post(payload)

        assert response.status_code == 422
        assert field in response.json()["detail"]

    payload = _valid_single_item_request()
    payload["items"][0]["weight"] = -1

    response = _post(payload)

    assert response.status_code == 200
    rejects = response.json()["rejects"]
    assert len(rejects) == 1
    assert rejects[0]["item_ref"] == "ITM-001"
    assert rejects[0]["reason_code"] == "MISSING_MASS"


@pytest.mark.parametrize("body", [[], "request", 42, None])
def test_non_object_bodies_return_422_and_name_the_body(body):
    response = _post(body)

    assert response.status_code == 422
    assert "request body" in response.json()["detail"]


def test_bad_json_body_returns_400():
    response = CLIENT.post(
        "/v1/solve/portal",
        content=b'{"order_id":',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400


@pytest.mark.parametrize(
    ("field", "value", "reason_code"),
    [
        ("width", -1, "INVALID_DIMENSIONS"),
        ("width", 0, "INVALID_DIMENSIONS"),
        ("width", 0.4, "INVALID_DIMENSIONS"),
        ("weight", -1, "MISSING_MASS"),
    ],
    ids=["negative-width", "zero-width", "rounded-to-zero", "negative-weight"],
)
def test_bad_item_values_are_per_item_rejects(field, value, reason_code):
    payload = _valid_single_item_request()
    payload["items"][0][field] = value

    response = _post(payload)

    assert response.status_code == 200
    rejects = response.json()["rejects"]
    assert len(rejects) == 1
    assert rejects[0]["item_ref"] == "ITM-001"
    assert rejects[0]["reason_code"] == reason_code


def test_unknown_fields_are_ignored_and_duplicate_item_codes_both_place():
    payload = deepcopy(PORTAL_REQUEST)
    payload["unexpected_request_field"] = {"ignored": True}
    payload["items"][0]["unexpected_item_field"] = "ignored"
    payload["boxes"][0]["unexpected_box_field"] = "ignored"
    payload["items"][1]["item_code"] = "ITM-001"

    response = _post(payload)

    assert response.status_code == 200
    document = response.json()
    placed_refs = [
        placement["item_ref"]
        for carton in document["cartons"]
        for placement in carton["placements"]
    ]
    assert placed_refs == ["ITM-001", "ITM-001"]
    assert document["rejects"] == []
