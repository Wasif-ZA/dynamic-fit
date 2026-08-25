import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import orders as orders_route

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


@pytest.fixture(autouse=True)
def clear_orders(monkeypatch):
    """Isolate tests from the module-private in-memory store."""
    monkeypatch.setattr(orders_route, "_orders", {})
    monkeypatch.setattr(orders_route, "_next_order_number", 1)


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

        assert body["Items"] == [VALID_ITEM, SECOND_ITEM]

    def test_response_uses_pascal_case_field_names(self):
        body = client.post("/orders", json=VALID_ORDER).json()

        assert set(body) == {"OrderId", "Items"}

    def test_empty_item_list_is_rejected(self):
        response = client.post("/orders", json={"Items": []})

        assert response.status_code == 422

    def test_invalid_nested_item_is_rejected(self):
        response = client.post("/orders", json={"Items": [{**VALID_ITEM, "Weight": 0}]})

        assert response.status_code == 422

    def test_caller_supplied_order_id_is_rejected(self):
        response = client.post("/orders", json={**VALID_ORDER, "OrderId": "ORD-999"})

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
        assert body["Items"] == [SECOND_ITEM]

    def test_orders_are_retrieved_independently(self):
        first = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        second = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()["OrderId"]

        assert client.get(f"/orders/{first}").json()["Items"] == [VALID_ITEM]
        assert client.get(f"/orders/{second}").json()["Items"] == [SECOND_ITEM]

    def test_unknown_order_id_returns_not_found(self):
        response = client.get("/orders/ORD-404")

        assert response.status_code == 404
        assert response.json()["detail"] == "Order not found"


class TestDocumentation:
    def test_order_endpoints_are_documented(self):
        paths = client.get("/openapi.json").json()["paths"]

        assert "post" in paths["/orders"]
        assert "get" in paths["/orders/{order_id}"]
        assert "get" in paths["/health"]
