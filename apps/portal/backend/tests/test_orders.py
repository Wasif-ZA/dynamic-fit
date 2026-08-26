import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import app

client = TestClient(app)

VALID_ITEM = {
    "ItemCode": "ITM-001",
    "ItemReference": "Widget A",
    "Width": 100,
    "Length": 200,
    "Depth": 50,
    "Weight": 1.25,
}

SECOND_ITEM = {
    "ItemCode": "ITM-002",
    "ItemReference": "Widget B",
    "Width": 300,
    "Length": 150,
    "Depth": 75,
    "Weight": 2.8,
    "BoxGroup": "GROUP-A",
}

VALID_ORDER = {"Items": [VALID_ITEM]}

# Quantity 1, Hazardous false unless the caller sets them.
ITEM_DEFAULTS = {"Quantity": 1, "Hazardous": False}


def as_stored(item: dict) -> dict:
    return {**ITEM_DEFAULTS, **item}


@pytest.fixture(autouse=True)
def clear_orders():
    store.reset()
    yield
    store.reset()


class TestCreateOrder:
    def test_valid_order_is_created(self):
        response = client.post("/orders", json=VALID_ORDER)

        assert response.status_code == 201

    def test_response_contains_generated_order_id(self):
        body = client.post("/orders", json=VALID_ORDER).json()

        assert body["OrderId"] == "ORD-001"

    def test_order_ids_increment(self):
        first = client.post("/orders", json=VALID_ORDER).json()
        second = client.post("/orders", json=VALID_ORDER).json()
        third = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()

        assert [first["OrderId"], second["OrderId"], third["OrderId"]] == [
            "ORD-001",
            "ORD-002",
            "ORD-003",
        ]

    def test_returned_items_match_submitted_items(self):
        body = client.post("/orders", json={"Items": [VALID_ITEM, SECOND_ITEM]}).json()

        assert body["Items"] == [as_stored(VALID_ITEM), as_stored(SECOND_ITEM)]

    def test_response_uses_pascal_case_field_names(self):
        body = client.post("/orders", json=VALID_ORDER).json()

        assert set(body) == {"OrderId", "Items", "Status", "CreatedAt"}

    def test_new_orders_start_as_drafts(self):
        assert client.post("/orders", json=VALID_ORDER).json()["Status"] == "Draft"

    def test_created_at_is_assigned_by_the_backend(self):
        assert client.post("/orders", json=VALID_ORDER).json()["CreatedAt"]

    def test_reference_is_stored_when_supplied(self):
        body = client.post(
            "/orders", json={**VALID_ORDER, "Reference": "Bunnings - Chullora"}
        ).json()

        assert body["Reference"] == "Bunnings - Chullora"

    def test_empty_box_group_is_stored_as_omitted(self):
        body = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "BoxGroup": ""}]}
        ).json()

        assert "BoxGroup" not in body["Items"][0]

    def test_quantity_and_hazardous_are_accepted(self):
        item = {**VALID_ITEM, "Quantity": 4, "Hazardous": True}

        body = client.post("/orders", json={"Items": [item]}).json()

        assert body["Items"][0]["Quantity"] == 4
        assert body["Items"][0]["Hazardous"] is True

    def test_empty_item_list_is_rejected(self):
        response = client.post("/orders", json={"Items": []})

        assert response.status_code == 422

    def test_invalid_nested_item_is_rejected(self):
        response = client.post("/orders", json={"Items": [{**VALID_ITEM, "Weight": 0}]})

        assert response.status_code == 422

    @pytest.mark.parametrize("dimension", ["Width", "Length", "Depth"])
    @pytest.mark.parametrize("value", [0, -5])
    def test_invalid_dimensions_are_rejected(self, dimension, value):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, dimension: value}]}
        )

        assert response.status_code == 422

    @pytest.mark.parametrize("value", [0, -1])
    def test_invalid_quantity_is_rejected(self, value):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "Quantity": value}]}
        )

        assert response.status_code == 422

    def test_caller_supplied_order_id_is_rejected(self):
        response = client.post("/orders", json={**VALID_ORDER, "OrderId": "ORD-999"})

        assert response.status_code == 422

    @pytest.mark.parametrize("field, value", [("Status", "Packed"), ("CreatedAt", "2020-01-01")])
    def test_caller_supplied_server_fields_are_rejected(self, field, value):
        response = client.post("/orders", json={**VALID_ORDER, field: value})

        assert response.status_code == 422


class TestGetOrder:
    def test_existing_order_is_returned(self):
        created = client.post("/orders", json=VALID_ORDER).json()

        response = client.get(f"/orders/{created['OrderId']}")

        assert response.status_code == 200
        assert response.json() == created

    def test_returned_order_matches_submission(self):
        order_id = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()["OrderId"]

        body = client.get(f"/orders/{order_id}").json()

        assert body["OrderId"] == order_id
        assert body["Items"] == [as_stored(SECOND_ITEM)]

    def test_orders_are_retrieved_independently(self):
        first = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        second = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()["OrderId"]

        assert client.get(f"/orders/{first}").json()["Items"] == [as_stored(VALID_ITEM)]
        assert client.get(f"/orders/{second}").json()["Items"] == [as_stored(SECOND_ITEM)]

    def test_unknown_order_id_returns_not_found(self):
        response = client.get("/orders/ORD-404")

        assert response.status_code == 404
        assert response.json()["detail"] == "Order not found"


class TestListOrders:
    def test_no_orders_is_an_empty_list(self):
        response = client.get("/orders")

        assert response.status_code == 200
        assert response.json() == []

    def test_every_created_order_is_listed(self):
        first = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        second = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()["OrderId"]

        listed = [order["OrderId"] for order in client.get("/orders").json()]

        assert sorted(listed) == sorted([first, second])

    def test_newest_order_is_listed_first(self):
        client.post("/orders", json=VALID_ORDER)
        newest = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()["OrderId"]

        assert client.get("/orders").json()[0]["OrderId"] == newest

    def test_listed_orders_carry_the_same_detail_as_a_single_fetch(self):
        order_id = client.post(
            "/orders", json={**VALID_ORDER, "Reference": "Officeworks DC"}
        ).json()["OrderId"]

        assert client.get("/orders").json()[0] == client.get(f"/orders/{order_id}").json()


class TestDocumentation:
    def test_order_endpoints_are_documented(self):
        paths = client.get("/openapi.json").json()["paths"]

        assert "post" in paths["/orders"]
        assert "get" in paths["/orders"]
        assert "get" in paths["/orders/{order_id}"]
        assert "get" in paths["/health"]
