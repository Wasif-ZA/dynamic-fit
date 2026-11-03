"""Portal order -> contract/request.schema.json."""

from __future__ import annotations

from decimal import ROUND_FLOOR, Decimal

from app.models import BoxType, Item, StoredOrder
from app.item_weights import contents_capacity_grams

# Width, Length, Depth -> solver [x, y, z]. Matches fitsolver.portal.AXIS_ORDER.
AXIS_ORDER = ("Width", "Length", "Depth")

GRAMS_PER_KG = 1000


def _grams(kilograms: float) -> int:
    return round(kilograms * GRAMS_PER_KG)


def _item_dims(item: Item) -> list[int]:
    return [item.width, item.length, item.depth]


def _whole_mm_inside(value: float) -> int:
    """Round an inner measurement down: a 400.6 mm box only holds 400 mm items."""
    return int(Decimal(str(value)).to_integral_value(rounding=ROUND_FLOOR))


def _box_dims(box: BoxType) -> list[int]:
    return [_whole_mm_inside(box.width), _whole_mm_inside(box.length), _whole_mm_inside(box.depth)]


def item_to_contract(item: Item) -> dict:
    return {
        "item_ref": item.item_code,
        "label": item.item_reference,
        "dims": _item_dims(item),
        "mass": _grams(item.weight),
        "quantity": item.quantity,
        "dg_class": item.box_group or None,
    }


def box_to_contract(box: BoxType) -> dict:
    return {
        "sku": box.reference,
        "inner_dims": _box_dims(box),
        "tare_mass": _grams(box.box_weight or 0),
        "max_contents_mass": contents_capacity_grams(box),
        "maximum_boxes": box.maximum_boxes,
    }


def to_solver_request(order: StoredOrder, boxes: list[BoxType]) -> dict:
    return {
        "order_id": order.order_id,
        "items": [item_to_contract(item) for item in order.items],
        # A box under 1 mm in any direction holds nothing; leave it out rather
        # than fail the whole request.
        "cartons": [box_to_contract(box) for box in boxes if all(_box_dims(box))],
    }
