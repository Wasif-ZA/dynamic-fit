"""Portal order fields -> contract/request.schema.json."""

from __future__ import annotations

from app.boxes import active_box_types
from app.models import BoxType, Item, StoredOrder
from app.solver_adapter import HAZARDOUS_TAG, box_to_contract, item_to_contract, to_solver_request


def an_item(**overrides) -> Item:
    payload = {
        "ItemCode": "MUG",
        "ItemReference": "SKU-MUG",
        "Width": 100,
        "Length": 110,
        "Depth": 120,
        "Weight": 0.35,
    }
    payload.update(overrides)
    return Item(**payload)


def test_item_code_becomes_item_ref_and_reference_becomes_label():
    mapped = item_to_contract(an_item())

    assert mapped["item_ref"] == "MUG"
    assert mapped["label"] == "SKU-MUG"


def test_dimensions_keep_portal_axis_order():
    """Width, Length, Depth -> [x, y, z]."""
    mapped = item_to_contract(an_item(Width=100, Length=110, Depth=120))

    assert mapped["dims"] == [100, 110, 120]


def test_kilograms_become_integer_grams():
    assert item_to_contract(an_item(Weight=2.5))["mass"] == 2500


def test_quantity_is_passed_through_not_expanded():
    mapped = item_to_contract(an_item(Quantity=3))

    assert mapped["quantity"] == 3
    assert mapped["item_ref"] == "MUG"


def test_empty_box_group_becomes_no_dg_class():
    assert item_to_contract(an_item())["dg_class"] is None


def test_box_group_becomes_dg_class():
    assert item_to_contract(an_item(BoxGroup="DG-8"))["dg_class"] == "DG-8"


def test_hazardous_becomes_a_tag_not_a_packing_rule():
    flagged = item_to_contract(an_item(Hazardous=True, BoxGroup="DG-8"))
    plain = item_to_contract(an_item())

    assert flagged["tags"] == [HAZARDOUS_TAG]
    assert flagged["dg_class"] == "DG-8"
    assert plain["tags"] == []
    assert plain["dg_class"] is None


def test_box_reference_becomes_sku():
    box = BoxType(Reference="BOX-S", Width=220, Length=160, Depth=120, MaxWeight=15)
    assert box_to_contract(box)["sku"] == "BOX-S"


def test_missing_box_weight_is_a_zero_tare():
    box = BoxType(Reference="BOX-S", Width=220, Length=160, Depth=120, MaxWeight=15)
    assert box_to_contract(box)["tare_mass"] == 0


def test_missing_max_weight_is_an_unlimited_carton():
    box = BoxType(Reference="BOX-S", Width=220, Length=160, Depth=120)
    assert box_to_contract(box)["max_contents_mass"] is None


def test_the_catalogue_reproduces_the_committed_fixture_interiors():
    interiors = {
        box_to_contract(box)["sku"]: box_to_contract(box)["inner_dims"]
        for box in active_box_types()
    }

    assert interiors == {
        "BOX-S": [220, 160, 120],
        "BOX-M": [320, 240, 180],
        "BOX-L": [450, 350, 300],
    }


def test_to_solver_request_carries_the_canonical_order_id():
    order = StoredOrder(OrderId="ORD-042", Items=[an_item()])
    request = to_solver_request(order, active_box_types())

    assert request["order_id"] == "ORD-042"
    assert len(request["items"]) == 1
    assert {carton["sku"] for carton in request["cartons"]} == {"BOX-S", "BOX-M", "BOX-L"}


def test_portal_only_fields_do_not_cross_the_boundary():
    order = StoredOrder(
        OrderId="ORD-001",
        Reference="Bunnings - Chullora",
        Items=[an_item()],
    )
    request = to_solver_request(order, active_box_types())

    assert "Reference" not in request
    assert "Status" not in request
    assert "CreatedAt" not in request
    assert "reference" not in request
