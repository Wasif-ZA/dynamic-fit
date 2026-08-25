"""Head-to-head: FitSolver vs BoxPacker-equivalent, identical inputs.

Usage:  python bench/compare.py [--budget-ms 1000] [--cases 20]
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from baseline_boxpacker import boxpacker_pack  # noqa: E402
from fitsolver.domain import Carton, Item  # noqa: E402
from fitsolver.pack import pack  # noqa: E402
from run import CARTONS, load_cases  # noqa: E402


def to_domain(case: dict) -> tuple[list[Item], list[Carton]]:
    items = [Item(ref=i["item_ref"], dims=tuple(i["dims"]), mass=i["mass"])
             for i in case["items"]]
    cartons = [Carton(sku=c["sku"], inner_dims=tuple(c["inner_dims"]),
                      tare_mass=c["tare_mass"]) for c in CARTONS]
    return items, cartons


def summarise(name, cartons, unplaced, elapsed_ms, n_items):
    vol = sum(c.carton.volume for c in cartons)
    used = sum(p.dims[0] * p.dims[1] * p.dims[2]
               for c in cartons for p in c.placements)
    fill = used / vol if vol else 0.0
    return {"name": name, "cartons": len(cartons), "fill": fill,
            "unplaced": len(unplaced), "ms": elapsed_ms,
            "carton_volume": vol}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-ms", type=int, default=1000)
    ap.add_argument("--cases", type=int, default=20)
    args = ap.parse_args()

    cases = load_cases(n_cases=args.cases)
    tot = {"bp": [0, 0, 0, 0.0, 0], "fs": [0, 0, 0, 0.0, 0]}
    # [cartons, unplaced, ms, fill_sum, carton_volume]

    print(f"{'case':>6} {'items':>6} | {'BP box':>7} {'BP fill':>8} "
          f"{'BP ms':>7} | {'FS box':>7} {'FS fill':>8} {'FS ms':>7}")
    print("-" * 76)

    for n, case in enumerate(cases):
        items, cartons = to_domain(case)

        t = time.monotonic()
        bp_cartons, bp_left = boxpacker_pack(items, cartons)
        bp_ms = int((time.monotonic() - t) * 1000)
        bp = summarise("bp", bp_cartons, bp_left, bp_ms, len(items))

        sol = pack(items, cartons, time_budget_ms=args.budget_ms, seed=1234)
        fs = summarise("fs", sol.cartons, sol.rejects, sol.elapsed_ms,
                       len(items))

        for key, r in (("bp", bp), ("fs", fs)):
            tot[key][0] += r["cartons"]
            tot[key][1] += r["unplaced"]
            tot[key][2] += r["ms"]
            tot[key][3] += r["fill"]
            tot[key][4] += r["carton_volume"]

        print(f"{n:>6} {len(items):>6} | {bp['cartons']:>7} "
              f"{bp['fill']:>8.3f} {bp['ms']:>7} | {fs['cartons']:>7} "
              f"{fs['fill']:>8.3f} {fs['ms']:>7}")

    k = len(cases)
    print("-" * 76)
    print(f"{'TOTAL':>6} {'':>6} | {tot['bp'][0]:>7} "
          f"{tot['bp'][3]/k:>8.3f} {tot['bp'][2]:>7} | {tot['fs'][0]:>7} "
          f"{tot['fs'][3]/k:>8.3f} {tot['fs'][2]:>7}")
    print()
    dc = tot["bp"][0] - tot["fs"][0]
    dv = tot["bp"][4] - tot["fs"][4]
    print(f"cartons:        BoxPacker {tot['bp'][0]}  FitSolver {tot['fs'][0]}"
          f"   ({dc:+d}, {100*dc/max(tot['bp'][0],1):+.1f}%)")
    print(f"carton volume:  {dv/1e6:+.1f} L "
          f"({100*dv/max(tot['bp'][4],1):+.1f}%)")
    print(f"mean fill:      BoxPacker {tot['bp'][3]/k:.3f}  "
          f"FitSolver {tot['fs'][3]/k:.3f}")
    print(f"unplaced:       BoxPacker {tot['bp'][1]}  "
          f"FitSolver {tot['fs'][1]}")
    print(f"total ms:       BoxPacker {tot['bp'][2]}  "
          f"FitSolver {tot['fs'][2]}")


if __name__ == "__main__":
    main()
