"""Pack a stored order. Re-solving overwrites the solution for the same OrderId."""

import logging

from fastapi import APIRouter, HTTPException, status
from fitsolver import io
from fitsolver.engine import solve as solve_request

from app import store
from app.boxes import active_box_types
from app.models import StoredOrder
from app.solver_adapter import to_solver_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["solve"])


def _require_order(order_id: str) -> StoredOrder:
    stored = store.find_order(order_id)
    if stored is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        )
    return stored


@router.post(
    "/{order_id}/solve",
    summary="Pack an order",
    response_description="A solution document, as contract/solution.schema.json",
)
def solve_order(order_id: str) -> dict:
    stored = _require_order(order_id)

    boxes = active_box_types()
    if not boxes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No active box types: the solver has nothing to pack into.",
        )

    request = to_solver_request(stored, boxes)

    try:
        document = solve_request(request)
    except io.RequestError as exc:
        logger.exception("solver rejected the request for %s", order_id)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"The packing request for {order_id} was rejected: {exc}",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("solver failed on %s", order_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"The packing service failed while solving {order_id}.",
        ) from exc

    store.save_solution(order_id, document)

    stored.status = "Packed"
    store.update_order(stored)

    return document


def _require_solution(order_id: str) -> dict:
    document = store.find_solution(order_id)
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order has not been solved. POST to /orders/{order_id}/solve first.",
        )
    return document


@router.get(
    "/{order_id}/solution",
    summary="The solution document, ready for the visualiser",
)
def get_solution(order_id: str) -> dict:
    return _require_solution(order_id)


@router.get(
    "/{order_id}/solution/summary",
    summary="Solution headline for the order page",
)
def get_solution_summary(order_id: str) -> dict:
    """Kilograms for the order page. Solver document stays in grams."""
    document = _require_solution(order_id)
    return {
        "OrderId": document.get("order_id", order_id),
        "BoxCount": document["metrics"]["carton_count"],
        "FillRate": document["metrics"]["fill_rate"],
        "TotalWeightKg": round(document["metrics"]["total_mass"] / 1000, 3),
        "SolveTimeMs": document["solver"]["elapsed_ms"],
        "ItemsPacked": sum(
            len(carton["placements"]) for carton in document["cartons"]
        ),
        "Boxes": [
            {
                "CartonId": carton["carton_id"],
                "BoxType": carton["sku"],
                "ItemCount": len(carton["placements"]),
                "ContentsWeightKg": round(carton["contents_mass"] / 1000, 3),
                "FillRate": carton["fill_rate"],
            }
            for carton in document["cartons"]
        ],
        "Rejected": [
            {
                "ItemCode": reject["item_ref"],
                "Reason": reject["reason_code"],
                "Detail": reject["message"],
            }
            for reject in document["rejects"]
        ],
    }
