"""Every emitted document must validate against the published schema.

This is the CI gate that stops solver/portal/visualiser drift: if this
fails, the solver has broken the division-wide contract.
"""
from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from fitsolver.engine import solve

SCHEMA = json.loads(
    (Path(__file__).resolve().parents[2] / "contract" /
     "solution.schema.json").read_text())

REQUESTS = {
    "single_item": {
        "order_id": "ORD-1",
        "items": [{"item_ref": "SKU-1", "label": "Headphones",
                   "dims": [180, 120, 90], "mass": 640,
                   "tags": ["fragile"]}],
        "cartons": [{"sku": "BOX-M", "inner_dims": [320, 240, 180],
                     "tare_mass": 210}],
    },
    "multi_carton": {
        "order_id": "ORD-2",
        "time_budget_ms": 100,
        "items": [{"item_ref": f"SKU-{n}", "dims": [200, 150, 100],
                   "mass": 900} for n in range(9)],
        "cartons": [{"sku": "BOX-M", "inner_dims": [320, 240, 180],
                     "tare_mass": 210}],
    },
    "dg_split": {
        "order_id": "ORD-3",
        "items": [
            {"item_ref": "ACID", "dims": [100, 100, 100], "mass": 500,
             "dg_class": "8"},
            {"item_ref": "FUEL", "dims": [100, 100, 100], "mass": 500,
             "dg_class": "3"},
        ],
        "cartons": [{"sku": "BOX-S", "inner_dims": [220, 160, 120],
                     "tare_mass": 120}],
    },
    "with_rejects": {
        "order_id": "ORD-4",
        "items": [
            {"item_ref": "OK", "dims": [100, 100, 100], "mass": 500},
            {"item_ref": "HUGE", "dims": [900, 900, 900], "mass": 500},
            {"item_ref": "BAD", "dims": [0, -5, 100], "mass": 500},
        ],
        "cartons": [{"sku": "BOX-S", "inner_dims": [220, 160, 120],
                     "tare_mass": 120}],
    },
}


@pytest.mark.parametrize("name", REQUESTS)
def test_document_validates(name):
    doc = solve(REQUESTS[name])
    jsonschema.validate(doc, SCHEMA)


def test_dg_classes_never_share_a_carton():
    doc = solve(REQUESTS["dg_split"])
    assert doc["metrics"]["carton_count"] == 2


def test_rejects_are_per_item_not_whole_request():
    doc = solve(REQUESTS["with_rejects"])
    placed = [p["item_ref"] for c in doc["cartons"] for p in c["placements"]]
    codes = {r["item_ref"]: r["reason_code"] for r in doc["rejects"]}
    assert placed == ["OK"]
    assert codes["HUGE"] == "NO_FITTING_CARTON"
    assert codes["BAD"] == "INVALID_DIMENSIONS"
