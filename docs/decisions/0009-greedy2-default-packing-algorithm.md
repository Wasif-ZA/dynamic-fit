# ADR-0009: greedy2 becomes the solver's default packing algorithm

- **Status:** accepted
- **Date:** 2026-10-07

Decided in DynamicSolver [PR #17](https://github.com/Wasif-ZA/DynamicSolver/pull/17)
("Feat/greedy2", merged 2026-10-07, merge commit `11bedff`, authored by `jesseosu`). The
monorepo port is in progress on branch `feat/solver-sync-greedy2`; until it lands,
`packages/solver` in this repository still runs the earlier packer (`pack.py`, called v1
below).

## Context

The v1 packer in `fitsolver.pack` opened more cartons than it needed on large orders. PR #17
adds a second packer, `fitsolver/src/fitsolver/greedy2/`, developed beside v1 rather than on
top of it so both can be run on identical input. v1 and the older `bin4d` packer are left
untouched and kept for reference. The PR changes only three existing lines: one import in
`engine.py`, and one each in `test_properties.py` and `test_scaling.py`.

## Decision

**The service uses greedy2.** `engine.py` imports `greedy2.pack.pack`, which has the same
signature as v1 (`pack(items, cartons, time_budget_ms=1200, seed=1)`).

Properties the PR documents:

- Integer millimetres and grams throughout, no floats, no wall-clock reads during a solve.
- The only randomness is seeded from the request's `seed`, so the same request and seed
  give the same layout on any machine.
- Items are sorted by content, so the same goods in a different order give the same layout.
- Each round test-fills every usable carton type and keeps the one that packs the most
  volume. The README calls this the most important decision in the solver: opening the
  smallest carton that fits is 5 to 20 times worse.

## Measured results

From `greedy2/README.md` and `DESIGN_NOTES.md` in DynamicSolver. Cartons used, fewer is
better. Geometry-bound means no mass limit; budget 1200 ms, seed 1.

| Workload | v1 | greedy2 |
|---|---:|---:|
| W1: 1000 items, all-distinct shapes | 36 | **20** |
| W2: 1000 items from 40 SKUs | 32 | **20** |
| W3: 40 small orders of 5 to 60 items | 60 | **46** |
| W4: mixed test cases | 28 | **25** |

W1 fill rate rises from 0.489 to 0.832. greedy2 uses fewer or equal cartons on all eight
workload rows (four geometry-bound, four mass-limited), with zero unplaced items.

Against exact optima computed with Google's CP-SAT solver on 64 small orders, greedy2 is
8.7% above optimum geometry-bound (v1: 23.2%) and 2.6% above with realistic mass limits
(v1: 13.2%).

## Caveat: weight limits shrink the gain

With realistic mass limits, weight rather than space decides the carton count, so there is
much less for a packer to get wrong. The mass-limited rows in `DESIGN_NOTES.md`:

| Workload | v1 | greedy2 |
|---|---:|---:|
| W1 | 54 | 53 |
| W2 | 56 | 54 |
| W3 | 87 | 87 |
| W4 | 32 | 31 |

So "20 cartons instead of 36" is the geometry-bound best case. On the weight-limited
versions of the same workloads the difference is 0 to 2 cartons.

Other caveats recorded by the authors:

- `PASS_COST_MS`, the per-pass cost table that sets how many passes fit in the budget, was
  measured on one development machine and may need re-measuring on the deployment machine.
- The benchmark scripts behind the tables (`bench/`) are maintained separately from the
  DynamicSolver repository, so the tables are recorded results, not something CI re-runs.

## Consequences

- Layouts are locked by `tests/data/greedy2_layouts.json` (about 2500 recorded placements),
  because a carton count alone cannot catch a regression where every item moves.
- This repository gets the gain only when `feat/solver-sync-greedy2` merges. The solver in
  `packages/solver` (history preserved from DynamicSolver, ADR-0007) will then need the
  same `engine.py` import and the greedy2 package.
- Fixtures in `contract/fixtures/` came from v1, so layouts will change after the port. The
  schema does not, so `contract/validate_fixtures.py` should still pass.
