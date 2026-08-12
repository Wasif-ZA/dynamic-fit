"""Benchmark harness. Run on every meaningful commit; history.jsonl is
committed to the repo so fill-rate regressions show up in the diff.

Phase 1 ships with a reproducible synthetic dataset so the harness works on
day one. Loading the Bischoff–Ratcliff (BR1–BR15) instances into `datasets/`
and pointing `load_cases` at them is a Sprint 1 task — the harness itself
does not change.

Usage:  python bench/run.py [--budget-ms 1000]
"""
from __future__ import annotations

import argparse
import json
import random
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from fitsolver.engine import solve  # noqa: E402

CARTONS = [
    {"sku": "S", "inner_dims": [220, 160, 120], "tare_mass": 120},
    {"sku": "M", "inner_dims": [320, 240, 180], "tare_mass": 210},
    {"sku": "L", "inner_dims": [450, 350, 300], "tare_mass": 380},
    {"sku": "XL", "inner_dims": [600, 400, 400], "tare_mass": 520},
]


def load_cases(seed: int = 7, n_cases: int = 20) -> list[dict]:
    rng = random.Random(seed)
    cases = []
    for k in range(n_cases):
        n_items = rng.choice([2, 4, 8, 15, 30])
        items = [{
            "item_ref": f"SKU-{k}-{i}",
            "dims": [rng.randrange(30, 300, 5) for _ in range(3)],
            "mass": rng.randrange(50, 4000, 10),
        } for i in range(n_items)]
        cases.append({"order_id": f"BENCH-{k}", "items": items,
                      "cartons": CARTONS})
    return cases


def git_rev() -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return "nogit"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-ms", type=int, default=1000)
    args = ap.parse_args()

    cases = load_cases()
    fills, cartons_used, rejected, elapsed = [], 0, 0, []
    t0 = time.monotonic()
    for case in cases:
        case["time_budget_ms"] = args.budget_ms
        doc = solve(case)
        fills.append(doc["metrics"]["fill_rate"])
        cartons_used += doc["metrics"]["carton_count"]
        rejected += len(doc["rejects"])
        elapsed.append(doc["solver"]["elapsed_ms"])

    record = {
        "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "rev": git_rev(),
        "budget_ms": args.budget_ms,
        "cases": len(cases),
        "mean_fill_rate": round(sum(fills) / len(fills), 4),
        "total_cartons": cartons_used,
        "rejected": rejected,
        "mean_elapsed_ms": round(sum(elapsed) / len(elapsed), 1),
        "wall_s": round(time.monotonic() - t0, 1),
    }
    out = Path(__file__).parent / "history.jsonl"
    with out.open("a") as f:
        f.write(json.dumps(record) + "\n")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
