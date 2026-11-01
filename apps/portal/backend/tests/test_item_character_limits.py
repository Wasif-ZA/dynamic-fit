"""Item text limits agree for creation, replacement and Unicode input."""

import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import Role
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
LIMITS = [("ItemCode", 32), ("ItemReference", 100)]
ITEM = {
    "ItemCode": "TEST", "ItemReference": "Character limit test",
    "Width": 100, "Length": 100, "Depth": 100, "Weight": 1,
}


@pytest.fixture(autouse=True)
def reset_stores():
    store.reset()
    yield
    store.reset()


@pytest.mark.parametrize("field, limit", LIMITS)
@pytest.mark.parametrize("character", ["A", "😀"])
def test_exact_limit_is_accepted_trimmed_and_read_back(field, limit, character):
    value = character * limit
    response = client.post("/orders", json={"Items": [{**ITEM, field: f"  {value}  "}]})

    assert response.status_code == 201, response.text
    assert response.json()["Items"][0][field] == value
    order_id = response.json()["OrderId"]
    assert client.get(f"/orders/{order_id}").json()["Items"][0][field] == value
    assert client.get("/orders").json()[0]["Items"][0][field] == value


@pytest.mark.parametrize("field, limit", LIMITS)
@pytest.mark.parametrize("character", ["A", "😀"])
def test_overlong_field_rejects_the_entire_order_without_truncation(field, limit, character):
    response = client.post("/orders", json={
        "Items": [ITEM, {**ITEM, field: character * (limit + 1)}],
    })

    assert response.status_code == 422
    error = response.json()["detail"][0]
    assert error["loc"] == ["body", "Items", 1, field]
    assert error["type"] == "string_too_long"
    assert error["ctx"]["max_length"] == limit
    assert client.get("/orders").json() == []


@pytest.mark.parametrize("field, limit", LIMITS)
def test_invalid_replacement_preserves_the_optimised_order_and_its_solution(field, limit):
    for box in DEFAULT_BOX_TYPES:
        boxes.add_box_type(box)
    order_id = client.post("/orders", json={"Items": [ITEM]}).json()["OrderId"]
    solved = client.post(f"/orders/{order_id}/solve", headers=auth_headers(Role.SUPERVISOR))
    assert solved.status_code == 200, solved.text
    original = client.get(f"/orders/{order_id}").json()

    response = client.put(f"/orders/{order_id}", json={
        "Items": [{**ITEM, field: "A" * (limit + 1)}],
    })

    assert response.status_code == 422
    assert client.get(f"/orders/{order_id}").json() == original
    assert client.get(f"/orders/{order_id}/solution").json() == solved.json()


def test_api_schema_exposes_the_agreed_character_limits():
    properties = client.get("/openapi.json").json()["components"]["schemas"]["Item"]["properties"]
    for field, limit in LIMITS:
        assert properties[field]["maxLength"] == limit
