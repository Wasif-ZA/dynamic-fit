"""Inventory rules shared by feasibility checks and finalisation."""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping

from app.models import BoxRequirement, BoxType, InventoryFeasibility


def required_cartons(solution: dict) -> dict[str, int]:
    """Count required cartons by box reference."""
    return dict(Counter(carton["sku"] for carton in solution.get("cartons", [])))


def assess_requirement(
    reference: str, required: int, box: BoxType | None
) -> BoxRequirement:
    if box is None:
        return BoxRequirement(
            Reference=reference,
            Required=required,
            Available=None,
            Active=None,
            Exists=False,
            Sufficient=False,
        )
    # No MaximumBoxes means no quantity limit, which is always enough.
    unlimited = box.maximum_boxes is None
    return BoxRequirement(
        Reference=reference,
        Required=required,
        Available=box.maximum_boxes,
        Active=box.active,
        Exists=True,
        Sufficient=box.active and (unlimited or box.maximum_boxes >= required),
    )


def assess_requirements(
    required: Mapping[str, int], boxes: Mapping[str, BoxType]
) -> InventoryFeasibility:
    requirements = [
        assess_requirement(reference, quantity, boxes.get(reference))
        for reference, quantity in required.items()
    ]
    return InventoryFeasibility(
        Sufficient=all(requirement.sufficient for requirement in requirements),
        Requirements=requirements,
    )


def _carton_label(requirement: BoxRequirement) -> str:
    plural = "es" if requirement.required != 1 else ""
    return f"{requirement.required} {requirement.reference} box{plural}"


def shortage_message(requirement: BoxRequirement) -> str:
    label = _carton_label(requirement)
    if not requirement.exists:
        return (
            f"The current solution requires {label}, "
            "but that box type is missing from inventory."
        )
    if not requirement.active:
        return (
            f"The current solution requires {label}, "
            "but that box type is inactive."
        )
    available_verb = "is" if requirement.available == 1 else "are"
    return (
        f"The current solution requires {label}, but only "
        f"{requirement.available} {available_verb} available."
    )


def shortage_messages(feasibility: InventoryFeasibility) -> list[str]:
    return [
        shortage_message(requirement)
        for requirement in feasibility.requirements
        if not requirement.sufficient
    ]
