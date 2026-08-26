"""Portal order -> contract/request.schema.json."""

from __future__ import annotations

from app.models import BoxType, Item, StoredOrder

# Width, Length, Depth -> solver [x, y, z]. Matches fitsolver.portal.AXIS_ORDER.
AXIS_ORDER = ("Width", "Length", "Depth")

GRAMS_PER_KG = 1000

HAZARDOUS_TAG = "HAZARDOUS"


def _grams(kilograms: float) -> int:
    return round(kilograms * GRAMS_PER_KG)


def _item_dims(item: Item) -> list[int]:
    return [item.width, item.length, item.depth]


def _box_dims(box: BoxType) -> list[int]:
    return [round(box.width), round(box.length), round(box.depth)]


def item_to_contract(item: Item) -> dict:
    return {
        "item_ref": item.item_code,
        "label": item.item_reference,
        "dims": _item_dims(item),
        "mass": _grams(item.weight),
        "quantity": item.quantity,
        "dg_class": item.box_group or None,
        "tags": [HAZARDOUS_TAG] if item.hazardous else [],
    }


def box_to_contract(box: BoxType) -> dict:
    return {
        "sku": box.reference,
        "inner_dims": _box_dims(box),
        "tare_mass": _grams(box.box_weight or 0),
        "max_contents_mass": (
            _grams(box.max_weight) if box.max_weight is not None else None
        ),
    }


def to_solver_request(order: StoredOrder, boxes: list[BoxType]) -> dict:
    return {
        "order_id": order.order_id,
        "items": [item_to_contract(item) for item in order.items],
        "cartons": [box_to_contract(box) for box in boxes],
    }
