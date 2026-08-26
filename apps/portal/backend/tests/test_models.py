from datetime import datetime

import pytest
from pydantic import ValidationError

from app.models import BoxType, Item, Order, StoredOrder

SAMPLE_ITEMS = [
    {
        "ItemCode": "ITM-001",
        "ItemReference": "Widget A",
        "Width": 100,
        "Length": 200,
        "Depth": 50,
        "Weight": 1,
        "BoxGroup": "GROUP-A",
    },
    {
        "ItemCode": "ITM-002",
        "ItemReference": "Widget B",
        "Width": 300,
        "Length": 150,
        "Depth": 75,
        "Weight": 2.8,
    },
    {
        "ItemCode": "ITM-003",
        "ItemReference": "Fragile Glassware",
        "Width": 80,
        "Length": 80,
        "Depth": 120,
        "Weight": 0.82,
        "BoxGroup": "GROUP-B",
    },
]

SAMPLE_BOX_TYPES = [
    {
        "Reference": "SML",
        "Width": 150,
        "Length": 150,
        "Depth": 150,
        "MaxWeight": 8.5,
        "BoxWeight": 0.5,
        "Active": True,
        "MaximumBoxes": 100,
    },
    {
        "Reference": "MED",
        "Width": 400,
        "Length": 400,
        "Depth": 400,
        "MaxWeight": 15.2,
        "BoxWeight": 0.75,
        "Active": True,
    },
    {
        "Reference": "LRG",
        "Width": 1200,
        "Length": 1200,
        "Depth": 1200,
        "Active": False,
    },
]

VALID_ITEM = SAMPLE_ITEMS[0]
VALID_BOX_TYPE = SAMPLE_BOX_TYPES[0]

# Quantity 1, Hazardous false unless the caller sets them.
ITEM_DEFAULTS = {"Quantity": 1, "Hazardous": False}


def without(payload: dict, key: str) -> dict:
    return {k: v for k, v in payload.items() if k != key}


def as_stored(payload: dict) -> dict:
    return {**ITEM_DEFAULTS, **payload, "Weight": float(payload["Weight"])}


class TestItem:
    @pytest.mark.parametrize("payload", SAMPLE_ITEMS)
    def test_sample_items_validate(self, payload):
        item = Item(**payload)

        assert item.item_code == payload["ItemCode"]
        assert item.weight == payload["Weight"]

    def test_fields_map_to_snake_case(self):
        item = Item(**VALID_ITEM)

        assert item.item_reference == "Widget A"
        assert item.width == 100
        assert item.length == 200
        assert item.depth == 50
        assert item.box_group == "GROUP-A"

    @pytest.mark.parametrize(
        "field",
        ["ItemCode", "ItemReference", "Width", "Length", "Depth", "Weight"],
    )
    def test_missing_required_field_is_rejected(self, field):
        with pytest.raises(ValidationError):
            Item(**without(VALID_ITEM, field))

    def test_unknown_field_is_rejected(self):
        with pytest.raises(ValidationError):
            Item(**{**VALID_ITEM, "Weght": 2.8})

    @pytest.mark.parametrize("dimension", ["Width", "Length", "Depth"])
    @pytest.mark.parametrize("value", [0, -1])
    def test_non_positive_dimension_is_rejected(self, dimension, value):
        with pytest.raises(ValidationError):
            Item(**{**VALID_ITEM, dimension: value})

    @pytest.mark.parametrize("value", [0, -0.5])
    def test_non_positive_weight_is_rejected(self, value):
        with pytest.raises(ValidationError):
            Item(**{**VALID_ITEM, "Weight": value})

    @pytest.mark.parametrize(
        "field", ["ItemCode", "ItemReference"]
    )
    def test_blank_string_is_rejected(self, field):
        with pytest.raises(ValidationError):
            Item(**{**VALID_ITEM, field: "   "})

    def test_box_group_may_be_omitted(self):
        item = Item(**without(VALID_ITEM, "BoxGroup"))

        assert item.box_group is None

    def test_blank_box_group_is_treated_as_omitted(self):
        assert Item(**{**VALID_ITEM, "BoxGroup": ""}).box_group is None
        assert Item(**{**VALID_ITEM, "BoxGroup": "   "}).box_group is None

    def test_quantity_defaults_to_one(self):
        assert Item(**VALID_ITEM).quantity == 1

    @pytest.mark.parametrize("value", [2, 250])
    def test_quantity_above_one_is_accepted(self, value):
        assert Item(**{**VALID_ITEM, "Quantity": value}).quantity == value

    @pytest.mark.parametrize("value", [0, -1])
    def test_non_positive_quantity_is_rejected(self, value):
        with pytest.raises(ValidationError):
            Item(**{**VALID_ITEM, "Quantity": value})

    def test_hazardous_defaults_to_false(self):
        assert Item(**VALID_ITEM).hazardous is False

    def test_hazardous_may_be_flagged(self):
        assert Item(**{**VALID_ITEM, "Hazardous": True}).hazardous is True


class TestBoxType:
    @pytest.mark.parametrize("payload", SAMPLE_BOX_TYPES)
    def test_sample_box_types_validate(self, payload):
        box_type = BoxType(**payload)

        assert box_type.reference == payload["Reference"]

    def test_fields_map_to_snake_case(self):
        box_type = BoxType(**VALID_BOX_TYPE)

        assert box_type.width == 150
        assert box_type.max_weight == 8.5
        assert box_type.box_weight == 0.5
        assert box_type.maximum_boxes == 100

    @pytest.mark.parametrize("field", ["Reference", "Width", "Length", "Depth"])
    def test_missing_required_field_is_rejected(self, field):
        with pytest.raises(ValidationError):
            BoxType(**without(VALID_BOX_TYPE, field))

    def test_unknown_field_is_rejected(self):
        with pytest.raises(ValidationError):
            BoxType(**{**VALID_BOX_TYPE, "Cost": 1.5})

    @pytest.mark.parametrize("dimension", ["Width", "Length", "Depth"])
    @pytest.mark.parametrize("value", [0, -1])
    def test_non_positive_dimension_is_rejected(self, dimension, value):
        with pytest.raises(ValidationError):
            BoxType(**{**VALID_BOX_TYPE, dimension: value})

    def test_blank_reference_is_rejected(self):
        with pytest.raises(ValidationError):
            BoxType(**{**VALID_BOX_TYPE, "Reference": "   "})

    @pytest.mark.parametrize(
        "field", ["MaxWeight", "BoxWeight", "MaximumBoxes"]
    )
    def test_optional_field_may_be_omitted(self, field):
        box_type = BoxType(**without(VALID_BOX_TYPE, field))

        assert getattr(box_type, {
            "MaxWeight": "max_weight",
            "BoxWeight": "box_weight",
            "MaximumBoxes": "maximum_boxes",
        }[field]) is None

    @pytest.mark.parametrize(
        "field", ["MaxWeight", "BoxWeight", "MaximumBoxes"]
    )
    @pytest.mark.parametrize("value", [0, -1])
    def test_non_positive_optional_value_is_rejected(self, field, value):
        with pytest.raises(ValidationError):
            BoxType(**{**VALID_BOX_TYPE, field: value})

    def test_active_defaults_to_true_when_omitted(self):
        box_type = BoxType(**without(VALID_BOX_TYPE, "Active"))

        assert box_type.active is True

    def test_active_false_is_accepted(self):
        box_type = BoxType(**{**VALID_BOX_TYPE, "Active": False})

        assert box_type.active is False


class TestOrder:
    def test_order_accepts_sample_items(self):
        order = Order(Items=SAMPLE_ITEMS)

        assert len(order.items) == 3
        assert order.items[2].item_reference == "Fragile Glassware"

    def test_empty_item_list_is_rejected(self):
        with pytest.raises(ValidationError):
            Order(Items=[])

    def test_invalid_nested_item_is_rejected(self):
        with pytest.raises(ValidationError):
            Order(Items=[{**VALID_ITEM, "Weight": 0}])

    def test_order_serialises_using_aliases(self):
        order = Order(Items=SAMPLE_ITEMS)

        payload = order.model_dump(by_alias=True, exclude_none=True)

        assert payload["Items"] == [as_stored(item) for item in SAMPLE_ITEMS]

    def test_order_round_trips_through_aliases(self):
        order = Order(Items=SAMPLE_ITEMS)

        payload = order.model_dump(by_alias=True, exclude_none=True)

        assert Order(**payload) == order

    def test_reference_may_be_omitted(self):
        assert Order(Items=SAMPLE_ITEMS).reference is None

    def test_reference_is_carried(self):
        order = Order(Reference="Bunnings - Chullora", Items=SAMPLE_ITEMS)

        assert order.reference == "Bunnings - Chullora"

    def test_blank_reference_is_rejected(self):
        with pytest.raises(ValidationError):
            Order(Reference="   ", Items=SAMPLE_ITEMS)


class TestStoredOrder:

    def test_status_starts_as_draft(self):
        assert StoredOrder(OrderId="ORD-001", Items=SAMPLE_ITEMS).status == "Draft"

    def test_created_at_is_assigned_automatically(self):
        stored = StoredOrder(OrderId="ORD-001", Items=SAMPLE_ITEMS)

        assert isinstance(stored.created_at, datetime)

    def test_unknown_status_is_rejected(self):
        with pytest.raises(ValidationError):
            StoredOrder(OrderId="ORD-001", Status="Shipped", Items=SAMPLE_ITEMS)

    def test_order_id_is_required(self):
        with pytest.raises(ValidationError):
            StoredOrder(Items=SAMPLE_ITEMS)


class TestValidationBehaviour:

    def test_pascal_case_aliases_populate_models(self):
        assert Item(**VALID_ITEM).item_code == "ITM-001"
        assert BoxType(**VALID_BOX_TYPE).reference == "SML"

    def test_snake_case_names_populate_models(self):
        item = Item(
            item_code="ITM-004",
            item_reference="Widget D",
            width=10,
            length=20,
            depth=30,
            weight=1.5,
        )
        box_type = BoxType(reference="XL", width=10, length=20, depth=30)

        assert item.item_code == "ITM-004"
        assert box_type.reference == "XL"

    def test_extra_fields_are_forbidden(self):
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            Item(**{**VALID_ITEM, "Unexpected": True})

    def test_dump_by_alias_round_trips(self):
        payload = Item(**VALID_ITEM).model_dump(by_alias=True, exclude_none=True)

        assert payload == as_stored(VALID_ITEM)
        assert Item(**payload) == Item(**VALID_ITEM)

    def test_surrounding_whitespace_is_stripped(self):
        assert Item(**{**VALID_ITEM, "ItemCode": "  ITM-001  "}).item_code == "ITM-001"
