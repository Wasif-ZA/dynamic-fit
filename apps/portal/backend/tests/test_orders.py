import pytest
from fastapi.testclient import TestClient

from app import boxes, store
from app.main import app
from app.models import Role
from tests.auth_helpers import auth_headers
from tests.box_fixtures import DEFAULT_BOX_TYPES

client = TestClient(app)
SUPERVISOR_HEADERS = auth_headers(Role.SUPERVISOR)

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

# Quantity 1 unless the caller sets it.
ITEM_DEFAULTS = {"Quantity": 1}


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
        assert body["Reference"] == "MQ-001"

    def test_order_ids_increment(self):
        first = client.post("/orders", json=VALID_ORDER).json()
        second = client.post("/orders", json=VALID_ORDER).json()
        third = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()

        assert [first["OrderId"], second["OrderId"], third["OrderId"]] == [
            "ORD-001",
            "ORD-002",
            "ORD-003",
        ]

    def test_order_references_increment_independently(self):
        first = client.post("/orders", json=VALID_ORDER).json()
        second = client.post("/orders", json=VALID_ORDER).json()
        third = client.post("/orders", json={"Items": [SECOND_ITEM]}).json()

        assert [first["Reference"], second["Reference"], third["Reference"]] == [
            "MQ-001",
            "MQ-002",
            "MQ-003",
        ]

    def test_returned_items_match_submitted_items(self):
        body = client.post("/orders", json={"Items": [VALID_ITEM, SECOND_ITEM]}).json()

        assert body["Items"] == [as_stored(VALID_ITEM), as_stored(SECOND_ITEM)]

    def test_response_uses_pascal_case_field_names(self):
        body = client.post("/orders", json=VALID_ORDER).json()

        assert set(body) == {"OrderId", "Reference", "Items", "Status", "CreatedAt"}

    def test_new_orders_start_as_drafts(self):
        assert client.post("/orders", json=VALID_ORDER).json()["Status"] == "DRAFT"

    def test_created_at_is_assigned_by_the_backend(self):
        assert client.post("/orders", json=VALID_ORDER).json()["CreatedAt"]

    def test_client_cannot_override_generated_reference(self):
        response = client.post(
            "/orders", json={**VALID_ORDER, "Reference": "CUSTOM-999"}
        )

        assert response.status_code == 422

    def test_empty_box_group_is_stored_as_omitted(self):
        body = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "BoxGroup": ""}]}
        ).json()

        assert "BoxGroup" not in body["Items"][0]

    def test_quantity_is_accepted(self):
        item = {**VALID_ITEM, "Quantity": 4}

        body = client.post("/orders", json={"Items": [item]}).json()

        assert body["Items"][0]["Quantity"] == 4
        assert "Hazardous" not in body["Items"][0]

    def test_hazardous_is_rejected_as_an_unknown_field(self):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "Hazardous": True}]}
        )

        assert response.status_code == 422

    def test_client_item_schema_round_trips(self):
        client_items = [
            {
                "ItemCode": "ACID",
                "ItemReference": "Acid Bottle (boxed)",
                "Width": 100,
                "Length": 100,
                "Depth": 200,
                "Weight": 1.9,
                "Quantity": 8,
                "BoxGroup": "CORROSIVE",
            },
            {
                "ItemCode": "BOOK",
                "ItemReference": "Hardback Book",
                "Width": 160,
                "Length": 100,
                "Depth": 100,
                "Weight": 0.5,
                "Quantity": 38,
            },
        ]

        created = client.post("/orders", json={"Items": client_items})

        assert created.status_code == 201
        order_id = created.json()["OrderId"]
        assert client.get(f"/orders/{order_id}").json()["Items"] == client_items

    def test_empty_item_list_is_rejected(self):
        response = client.post("/orders", json={"Items": []})

        assert response.status_code == 422

    def test_invalid_nested_item_is_rejected(self):
        response = client.post("/orders", json={"Items": [{**VALID_ITEM, "Weight": 0}]})

        assert response.status_code == 422

    def test_item_at_maximum_weight_is_accepted(self):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "Weight": 32}]}
        )

        assert response.status_code == 201

    def test_item_above_maximum_weight_is_rejected(self):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "Weight": 32.01}]}
        )

        assert response.status_code == 422

    @pytest.mark.parametrize("value", ["ABC", "12", "ITM-12", "PART-123-A"])
    def test_item_code_is_stored_exactly_as_given(self, value):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "ItemCode": value}]}
        )

        assert response.status_code == 201
        assert response.json()["Items"][0]["ItemCode"] == value
        order_id = response.json()["OrderId"]
        assert client.get(f"/orders/{order_id}").json()["Items"][0]["ItemCode"] == value

    def test_item_code_whitespace_is_trimmed(self):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "ItemCode": "  ABC  "}]}
        )

        assert response.status_code == 201
        assert response.json()["Items"][0]["ItemCode"] == "ABC"

    @pytest.mark.parametrize("value", ["", "   "])
    def test_blank_item_code_is_rejected(self, value):
        response = client.post(
            "/orders", json={"Items": [{**VALID_ITEM, "ItemCode": value}]}
        )

        assert response.status_code == 422

    def test_duplicate_item_codes_in_one_order_are_accepted(self):
        response = client.post(
            "/orders",
            json={"Items": [VALID_ITEM, {**SECOND_ITEM, "ItemCode": "ITM-001"}]},
        )

        assert response.status_code == 201
        assert [item["ItemCode"] for item in response.json()["Items"]] == [
            "ITM-001",
            "ITM-001",
        ]

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

    @pytest.mark.parametrize(
        "field, value", [("Status", "OPTIMISED"), ("CreatedAt", "2020-01-01")]
    )
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


class TestSubmitOrder:
    def test_draft_order_can_be_submitted(self):
        created = client.post("/orders", json=VALID_ORDER).json()

        response = client.post(f"/orders/{created['OrderId']}/submit")

        assert response.status_code == 200
        assert response.json()["Status"] == "AWAITING_OPTIMISATION"
        assert response.json()["Items"] == created["Items"]
        assert response.json()["OrderId"] == created["OrderId"]
        assert response.json()["Reference"] == created["Reference"]
        assert response.json()["CreatedAt"] == created["CreatedAt"]

    def test_unknown_order_cannot_be_submitted(self):
        response = client.post("/orders/ORD-404/submit")

        assert response.status_code == 404

    def test_awaiting_order_cannot_be_submitted_again(self):
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")

        response = client.post(f"/orders/{order_id}/submit")

        assert response.status_code == 409

    def test_optimised_order_cannot_be_submitted(self):
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")
        client.post(f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS)

        response = client.post(f"/orders/{order_id}/submit")

        assert response.status_code == 409


class TestUpdateOrder:
    def test_draft_order_items_can_be_replaced(self):
        created = client.post("/orders", json=VALID_ORDER).json()

        response = client.put(
            f"/orders/{created['OrderId']}", json={"Items": [SECOND_ITEM]}
        )

        assert response.status_code == 200
        assert response.json()["Items"] == [as_stored(SECOND_ITEM)]
        assert response.json()["Status"] == "DRAFT"
        assert response.json()["OrderId"] == created["OrderId"]
        assert response.json()["Reference"] == created["Reference"]
        assert response.json()["CreatedAt"] == created["CreatedAt"]

    def test_editing_awaiting_order_returns_it_to_draft(self):
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")

        response = client.put(f"/orders/{order_id}", json={"Items": [SECOND_ITEM]})

        assert response.status_code == 200
        assert response.json()["Status"] == "DRAFT"

    def test_editing_optimised_order_invalidates_solution(self):
        for box in DEFAULT_BOX_TYPES:
            boxes.add_box_type(box)
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]
        client.post(f"/orders/{order_id}/submit")
        assert (
            client.post(f"/orders/{order_id}/solve", headers=SUPERVISOR_HEADERS).status_code
            == 200
        )

        response = client.put(f"/orders/{order_id}", json={"Items": [SECOND_ITEM]})

        assert response.status_code == 200
        assert response.json()["Status"] == "DRAFT"
        assert client.get(f"/orders/{order_id}/solution").status_code == 404
        assert client.get(f"/orders/{order_id}/solution/summary").status_code == 404

    def test_unknown_order_cannot_be_updated(self):
        response = client.put("/orders/ORD-404", json=VALID_ORDER)

        assert response.status_code == 404

    @pytest.mark.parametrize(
        "field, value",
        [
            ("OrderId", "ORD-999"),
            ("Reference", "MQ-999"),
            ("CreatedAt", "2020-01-01"),
            ("Status", "OPTIMISED"),
        ],
    )
    def test_update_cannot_override_server_owned_fields(self, field, value):
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]

        response = client.put(
            f"/orders/{order_id}", json={**VALID_ORDER, field: value}
        )

        assert response.status_code == 422


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
        order_id = client.post("/orders", json=VALID_ORDER).json()["OrderId"]

        assert client.get("/orders").json()[0] == client.get(f"/orders/{order_id}").json()


class TestDocumentation:
    def test_order_endpoints_are_documented(self):
        paths = client.get("/openapi.json").json()["paths"]

        assert "post" in paths["/orders"]
        assert "get" in paths["/orders"]
        assert "get" in paths["/orders/{order_id}"]
        assert "put" in paths["/orders/{order_id}"]
        assert "post" in paths["/orders/{order_id}/submit"]
        assert "get" in paths["/health"]
