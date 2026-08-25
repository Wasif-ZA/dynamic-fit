"""The Dynamic Fit vertical slice.

    FitPortal -> FitSolver -> FitPortal -> FitVisualizer

An order enters at the Portal's HTTP boundary and leaves as a document the Three.js
renderer can draw. Every subsystem's own suite passed for months while the three
disagreed about field names, because no test ever put them in one process. This is
that test.

The solver's `tests/test_contract.py` already validates solver-authored documents
against the published schema. What is new here is the Portal as the author: these
requests are built by Portal models and converted by `fitsolver.portal`, which is
the path a real order takes and the path that was broken.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import jsonschema
import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
SOLUTION_SCHEMA = json.loads((ROOT / "contract" / "solution.schema.json").read_text())

client = TestClient(app)


def item(code: str, w: int, length: int, d: int, kg: float = 0.4, group: str | None = None) -> dict:
    payload = {
        "ItemCode": code,
        "ItemReference": f"SKU-{code}",
        "Width": w,
        "Length": length,
        "Depth": d,
        "Weight": kg,
    }
    if group:
        payload["BoxGroup"] = group
    return payload


def order_of(items: list[dict]) -> str:
    created = client.post("/orders", json={"Items": items})
    assert created.status_code == 201, created.text
    return created.json()["OrderId"]


def solve(order_id: str) -> dict:
    response = client.post(f"/orders/{order_id}/solve")
    assert response.status_code == 200, response.text
    return response.json()


def test_a_portal_order_produces_a_valid_solution_document():
    """The division-wide gate, applied to an order the Portal actually built."""
    document = solve(order_of([item("BOOK", 150, 100, 50), item("MUG", 100, 100, 120, 0.35)]))
    jsonschema.validate(document, SOLUTION_SCHEMA)


def test_the_portals_pascal_case_payload_reaches_the_solver():
    """Regression. The Portal serialises `ItemCode`; fitsolver.portal read
    `item_code`, so every real order failed at the boundary with
    "'items' must be a non-empty list" before anything was packed."""
    document = solve(order_of([item("MUG", 100, 100, 120, 0.35)]))

    assert document["metrics"]["carton_count"] == 1
    placed = [p["item_ref"] for c in document["cartons"] for p in c["placements"]]
    assert placed == ["MUG"]


def test_dangerous_goods_classes_do_not_share_a_carton():
    document = solve(
        order_of(
            [
                item("BLEACH", 90, 140, 90, 0.9, group="DG-8"),
                item("ACID", 90, 140, 90, 0.8, group="DG-5"),
            ]
        )
    )

    assert document["metrics"]["carton_count"] == 2
    for carton in document["cartons"]:
        refs = {p["item_ref"] for p in carton["placements"]}
        assert not {"BLEACH", "ACID"} <= refs


def test_two_items_of_the_same_class_may_share_a_carton():
    document = solve(
        order_of(
            [
                item("BLEACH-A", 90, 90, 90, 0.5, group="DG-8"),
                item("BLEACH-B", 90, 90, 90, 0.5, group="DG-8"),
            ]
        )
    )
    assert document["metrics"]["carton_count"] == 1


def test_an_oversized_item_is_rejected_with_a_reason_not_a_failure():
    """The client said just reject it. The Portal still shows which item and why."""
    document = solve(order_of([item("PALLET", 1200, 800, 1000, 450.0)]))

    assert document["cartons"] == []
    assert document["rejects"][0]["item_ref"] == "PALLET"
    assert document["rejects"][0]["reason_code"] == "NO_FITTING_CARTON"
    assert document["rejects"][0]["message"]
    jsonschema.validate(document, SOLUTION_SCHEMA)


def test_one_bad_item_does_not_fail_the_whole_order():
    document = solve(order_of([item("OK", 100, 100, 100, 0.4), item("HUGE", 900, 900, 900, 1.0)]))

    placed = [p["item_ref"] for c in document["cartons"] for p in c["placements"]]
    rejected = [r["item_ref"] for r in document["rejects"]]
    assert placed == ["OK"]
    assert rejected == ["HUGE"]


def test_every_unit_is_either_placed_or_rejected_exactly_once():
    codes = [f"I{n}" for n in range(10)]
    document = solve(order_of([item(code, 80, 60, 40, 0.3) for code in codes]))

    placed = [p["item_ref"] for c in document["cartons"] for p in c["placements"]]
    rejected = [r["item_ref"] for r in document["rejects"]]
    assert sorted(placed + rejected) == sorted(codes)


def test_nothing_protrudes_from_its_carton():
    document = solve(order_of([item(f"I{n}", 80, 60, 40, 0.3) for n in range(14)]))

    for carton in document["cartons"]:
        for placement in carton["placements"]:
            for axis in range(3):
                assert placement["position"][axis] >= 0
                assert (
                    placement["position"][axis] + placement["dims"][axis]
                    <= carton["inner_dims"][axis]
                ), f"{carton['carton_id']} overflows on axis {axis}"


def test_nothing_overlaps_inside_a_carton():
    document = solve(order_of([item(f"I{n}", 80, 60, 40, 0.3) for n in range(14)]))

    for carton in document["cartons"]:
        placements = carton["placements"]
        for i in range(len(placements)):
            for j in range(i + 1, len(placements)):
                a, b = placements[i], placements[j]
                # Touching faces are correct packing, so every test is strict.
                overlapping = all(
                    a["position"][axis] < b["position"][axis] + b["dims"][axis]
                    and b["position"][axis] < a["position"][axis] + a["dims"][axis]
                    for axis in range(3)
                )
                assert not overlapping, f"{a['item_ref']} overlaps {b['item_ref']}"


def test_kilograms_in_at_the_portal_are_grams_all_the_way_through():
    document = solve(order_of([item("HEAVY", 100, 100, 100, 2.5)]))

    assert document["units"]["mass"] == "g"
    assert document["cartons"][0]["placements"][0]["mass"] == 2500

    # Only the Portal's own display shape converts back.
    order_id = document["order_id"]
    summary = client.get(f"/orders/{order_id}/solution/summary").json()
    assert summary["Boxes"][0]["ContentsWeightKg"] == pytest.approx(2.5, abs=0.001)


def test_the_document_declares_the_axes_the_renderer_assumes():
    """visualiser.js maps JSON [x, y, z] to Three.js (x, z, y). It is only correct
    if the document really is z-up with a min-corner origin."""
    document = solve(order_of([item("MUG", 100, 100, 120, 0.35)]))

    assert document["coordinate_system"] == {
        "up": "z",
        "handedness": "right",
        "origin": "min_corner",
    }
    assert document["units"] == {"length": "mm", "mass": "g"}


def test_every_field_the_renderer_reads_is_present():
    """Taken from what visualiser.js actually indexes. A missing key here renders
    as `undefined` in the legend rather than raising."""
    document = solve(
        order_of([item("MUG", 100, 100, 120, 0.35), item("PALLET", 1200, 800, 1000, 450.0)])
    )

    for carton in document["cartons"]:
        for key in ("carton_id", "sku", "inner_dims", "contents_mass", "placements"):
            assert key in carton, f"carton missing {key}"
        for placement in carton["placements"]:
            for key in ("item_ref", "label", "position", "dims", "mass", "sequence", "tags"):
                assert key in placement, f"placement missing {key}"
            assert isinstance(placement["tags"], list)

    for reject in document["rejects"]:
        for key in ("item_ref", "reason_code", "message"):
            assert key in reject, f"reject missing {key}"


def test_sequence_is_contiguous_within_each_carton():
    """The step-by-step player reveals items in `sequence` order, so a gap shows
    up as an item that never appears."""
    document = solve(order_of([item(f"I{n}", 80, 60, 40, 0.3) for n in range(14)]))

    for carton in document["cartons"]:
        sequences = sorted(p["sequence"] for p in carton["placements"])
        assert sequences == list(range(len(sequences)))


def test_solving_an_unknown_order_is_a_404():
    assert client.post("/orders/ORD-9999/solve").status_code == 404


def test_reading_a_solution_before_solving_is_a_404():
    order_id = order_of([item("MUG", 100, 100, 120, 0.35)])
    response = client.get(f"/orders/{order_id}/solution")
    assert response.status_code == 404
    assert "has not been solved" in response.json()["detail"]


def test_the_stored_solution_is_the_document_that_was_returned():
    order_id = order_of([item("MUG", 100, 100, 120, 0.35)])
    solved = solve(order_id)
    assert client.get(f"/orders/{order_id}/solution").json() == solved


def test_a_realistic_order_solves_inside_the_client_latency_bar():
    """The client's stated bar is 1 to 2 seconds for one order. Measured on the
    wall clock as well as the reported metric, so a wrong metric cannot hide a
    slow solve."""
    order_id = order_of([item(f"I{n}", 80, 60, 40, 0.3) for n in range(60)])

    started = time.perf_counter()
    document = solve(order_id)
    wall_ms = (time.perf_counter() - started) * 1000

    assert document["solver"]["elapsed_ms"] < 2000
    assert wall_ms < 2000
    jsonschema.validate(document, SOLUTION_SCHEMA)


def test_solving_the_same_order_twice_gives_the_same_layout():
    """A packer who re-scans an order expects the same picture."""
    order_id = order_of([item(f"I{n}", 80, 60, 40, 0.3) for n in range(12)])
    first, second = solve(order_id), solve(order_id)

    assert first["cartons"] == second["cartons"]
    assert first["rejects"] == second["rejects"]


def test_health_and_docs_still_work():
    """The solve router must not have disturbed what was already there."""
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/openapi.json").status_code == 200
