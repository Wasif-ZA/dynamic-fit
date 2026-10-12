"""Optimise submitted orders and expose the active solution."""

import logging
from typing import Annotated

import os

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fitsolver import io
from fitsolver.engine import solve as solve_request

from app import boxes as box_inventory
from app import store
from app.auth import get_current_user, require_solver_user
from app.boxes import active_box_types
from app.errors import OrderNotFoundError, OrderStatusConflictError
from app.models import PortalUser, StoredOrder, VisualizerHandoff
from app.solver_adapter import to_solver_request
from app.visualizer_tokens import create_token, solution_digest, verify_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["solve"])

NO_AVAILABLE_BOXES_DETAIL = (
    "No available box types. Add or import at least one active box with available "
    "quantity before running optimisation."
)


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
def solve_order(
    order_id: str,
    _user: Annotated[PortalUser, Depends(require_solver_user)],
) -> dict:
    stored = _require_order(order_id)
    if stored.status not in {"AWAITING_OPTIMISATION", "OPTIMISED"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only orders awaiting optimisation or already optimised can be solved",
        )

    boxes = active_box_types()
    if not boxes:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=NO_AVAILABLE_BOXES_DETAIL,
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

    # The Solver ran without a lock, re-check state before replacing the result.
    try:
        return store.save_solution_for_optimised_order(order_id, document)
    except OrderNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found",
        ) from exc
    except OrderStatusConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=exc.detail,
        ) from exc


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
def get_solution(
    order_id: str,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> dict:
    """Return the unmodified document expected by FitVisualizer."""
    return _require_solution(order_id)


def _inventory_feasibility(order_id: str, document: dict) -> dict | None:
    """Return null after finalisation, when stock has already been consumed."""
    stored = store.find_order(order_id)
    if stored is None or stored.status == "FINAL":
        return None
    return box_inventory.assess_solution_inventory(document).model_dump(by_alias=True)


@router.get(
    "/{order_id}/solution/summary",
    summary="Solution headline for the order page",
)
def get_solution_summary(
    order_id: str,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> dict:
    """Kilograms for the order page. Solver document stays in grams."""
    document = _require_solution(order_id)
    return {
        "OrderId": document.get("order_id", order_id),
        "InventoryFeasibility": _inventory_feasibility(order_id, document),
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


@router.post(
    "/{order_id}/visualizer-handoff",
    response_model=VisualizerHandoff,
    summary="Create a short-lived FitVisualizer solution URL",
)
def create_visualizer_handoff(
    order_id: str,
    request: Request,
    _user: Annotated[PortalUser, Depends(get_current_user)],
) -> VisualizerHandoff:
    document = _require_solution(order_id)
    token, ttl = create_token(order_id, document)
    api_base = os.getenv("PORTAL_PUBLIC_API_URL", str(request.base_url)).rstrip("/")
    solution_url = (
        f"{api_base}/orders/{order_id}/solution/visualizer?token={token}"
    )
    return VisualizerHandoff(SolutionUrl=solution_url, ExpiresIn=ttl)


@router.get(
    "/{order_id}/solution/visualizer",
    summary="Read a solution using a scoped FitVisualizer handoff",
)
def get_visualizer_solution(order_id: str, token: str = "") -> dict:
    try:
        expected_digest = verify_token(token, order_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc
    document = _require_solution(order_id)
    if expected_digest != solution_digest(document):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired visualizer handoff",
        )
    return document
