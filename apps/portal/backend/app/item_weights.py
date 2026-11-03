"""Current box payload capacities, shared by validation and Solver mapping."""

from decimal import Decimal, ROUND_FLOOR

from app.errors import ItemWeightLimitError
from app.models import BoxType, Item


def contents_capacity_grams(box: BoxType) -> int | None:
    """MaxWeight is the weight of items a box holds; BoxWeight is not taken off.

    None is unlimited. Round down to the Solver's whole grams.
    """
    if box.max_weight is None:
        return None
    return int((Decimal(str(box.max_weight)) * 1000).to_integral_value(rounding=ROUND_FLOOR))


def maximum_item_weight_kg(boxes: list[BoxType]) -> float | None:
    """No boxes means drafts can still be prepared; solving requires inventory."""
    capacities = [contents_capacity_grams(box) for box in boxes]
    if not capacities or None in capacities:
        return None
    return max(capacities) / 1000


def validate_item_weights(items: list[Item], boxes: list[BoxType]) -> None:
    limit = maximum_item_weight_kg(boxes)
    if limit is None:
        return
    for index, item in enumerate(items):
        if Decimal(str(item.weight)) > Decimal(str(limit)):
            raise ItemWeightLimitError(
                f"Item {index + 1} ({item.item_code}): weight of {item.weight:g} kg "
                f"exceeds the current {limit:g} kg per-item capacity of available "
                "active boxes."
            )
