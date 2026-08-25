"""Ablation: which parts of the solver actually earn their lines?

This script produced the Phase 1 simplification. Run it before adding any
component, and delete the component if the delta is zero.

Original finding (20 random cases + 4 structured sets, both agreed):

    configuration                cartons   vs full
    full system                       28  baseline
    - anytime search (1 pass)         28        +0     <- deleted, 33x faster
    - consolidate pass                28        +0     <- deleted
    - downsize pass                   28        +0     <- deleted
    - contact-area scoring            28        +0     <- deleted
    - carton-selection search         73       +45     <- KEPT

pack.py went from 303 lines to 162 with no change in output quality.

Usage: PYTHONPATH=src python bench/ablate.py
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from compare import to_domain  # noqa: E402
from fitsolver import pack as P  # noqa: E402
from run import load_cases  # noqa: E402


def measure(label: str) -> tuple[str, int, float]:
    total = 0
    t0 = time.monotonic()
    for case in load_cases(n_cases=20):
        items, cartons = to_domain(case)
        total += P.pack(items, cartons, time_budget_ms=200,
                        seed=1234).carton_count
    return label, total, time.monotonic() - t0


def main() -> None:
    results = [measure("full system")]

    # The one surviving component: carton-selection search.
    orig = P.pack_one

    def first_fit_smallest(ordering, cartons):
        remaining, out = list(ordering), []
        by_vol = sorted(cartons, key=lambda c: c.volume)
        while remaining:
            for carton in by_vol:
                pc, left = P.fill_carton(carton, remaining[:P.CHUNK])
                if pc.placements:
                    out.append(pc)
                    remaining = left + remaining[P.CHUNK:]
                    break
            else:
                break
        return out, remaining

    P.pack_one = first_fit_smallest
    results.append(measure("- carton-selection search"))
    P.pack_one = orig

    base = results[0][1]
    print(f"\n{'configuration':<30} {'cartons':>8} {'vs full':>9} {'secs':>7}")
    print("-" * 58)
    for label, cartons, secs in results:
        d = "baseline" if cartons == base and "full" in label else f"{cartons-base:+d}"
        print(f"{label:<30} {cartons:>8} {d:>9} {secs:>7.2f}")
    print("\nBoxPacker-equivalent on same cases: 34 cartons")


if __name__ == "__main__":
    main()
