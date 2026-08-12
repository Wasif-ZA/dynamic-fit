# FitSolver vs BoxPacker — Phase 1 results

Run: `PYTHONPATH=src python bench/compare.py --budget-ms 200 --cases 20`
20 synthetic orders, 2–30 items, 4 carton types, identical inputs to both packers.

## Headline

| Metric | BoxPacker-equiv | FitSolver | Delta |
|---|---|---|---|
| **Cartons used** | 34 | **28** | **−17.6%** |
| **Total carton volume** | 2 178 L | **1 797 L** | **−17.5%** |
| Mean fill rate | 0.416 | 0.481 | +15.6% |
| Unplaced items | 0 | 0 | — |
| Total solve time | 33 ms | 3 300 ms | **100× slower** |

Carton count is the primary metric because the client's brief says
"reducing wasted space **and the number of boxes required**".

## Where the 17.6% actually came from

Measured by building the naive version first and comparing. This ordering
matters — the first attempt *lost to BoxPacker by 65%*.

| Change | Cartons | vs BoxPacker |
|---|---|---|
| Naive: first-fit-smallest carton, lowest-corner placement | 56 | **−64.7% (worse)** |
| + carton selection evaluates every type against all remaining items | ~34 | par |
| + contact-area placement scoring, downsize, consolidate | **28** | **+17.6%** |
| + anytime search over orderings (50 ms → 1 000 ms budget) | 28 | **no change** |

Two findings worth putting on the mid-term slide:

**1. Fill rate is a trap.** The naive version scored a *higher* fill rate
(0.552) than the improved one (0.481) while using twice as many cartons.
Packing many small cartons tightly maximises fill and is precisely what the
client does not want. We optimise lexicographically — unplaced, then carton
count, then total volume — and report fill rather than chasing it.

**2. The search currently contributes nothing.** All the gain is structural.
Random restarts over item orderings never beat the deterministic first pass,
because carton selection re-optimises on every pass and washes out the
ordering difference. 8 seconds of extra compute bought zero improvement.
This is the single clearest target for Phase 2: replace random restarts with
a biased generator that carries information between passes (BRKGA-style), or
drop the search entirely and spend the budget on carton-subset enumeration.

## Honest caveats — state these before anyone asks

- **This is a reimplementation of BoxPacker's algorithm, not the library.**
  BoxPacker is PHP; requiring PHP in the Python bench harness is fragile.
  `bench/baseline_boxpacker.py` ports the documented algorithm (sort → per-box
  trial over all remaining items → layer/row/column fill → weight
  redistribution). **Sprint 1 action: run the real library once by hand on
  these 20 cases and record the delta in the sprint log.** Until then, treat
  the comparison as indicative.
- **Synthetic dataset.** Uniform-random dimensions are not real order
  profiles. Sprint 1 action: load Bischoff & Ratcliff BR1–BR15 and Loh & Nee
  from OR-Library, and ask the client for anonymised historical orders.
- **We lose on latency, by design and by ~100×.** BoxPacker is one
  deterministic pass in milliseconds. Do not compete here. The tier-1 greedy
  path (single pass, ~10 ms) is the comparable configuration, and it already
  delivers the full 17.6% — see the budget row above.

## What the project actually wins on

The brief says the solver replaces BoxPacker "with a focus on **extensibility
and advanced constraint handling**". That is the real axis, and it is not
close:

| Capability | BoxPacker | FitSolver |
|---|---|---|
| Dangerous-goods class segregation | ✗ | ✓ (conflict pre-pass) |
| Item incompatibility rules | ✗ | ✓ |
| Customer-specific packing rules | ✗ | ✓ (same mechanism) |
| Support/stability constraint | ✗ | ✓ (≥70% base support) |
| Tunable time budget per request | ✗ | ✓ (`time_budget_ms`) |
| Structured per-item rejects | partial | ✓ (5 reason codes) |
| Machine-readable layout for visualisation | ✗ | ✓ (contract document) |

Carton count is the number that makes the case defensible. Constraint
handling is the reason the project exists.

---

# Scaling: does it work for n items?

Measured, not assumed. `tests/test_scaling.py` guards all of this.

| Items | Elapsed (1.5 s budget) | Cartons | Items/carton | Conservation |
|---|---|---|---|---|
| 10 | 1.50 s | 1 | 10.0 | ✓ |
| 50 | 1.50 s | 3 | 16.7 | ✓ |
| 100 | 1.52 s | 6 | 16.7 | ✓ |
| 200 | 1.53 s | 11 | 18.2 | ✓ |
| 400 | 1.81 s | 21 | 19.0 | ✓ |
| 800 | 2.21 s | 42 | 19.0 | ✓ |
| 1 600 | 2.17 s | 83 | 19.3 | ✓ |
| 3 200 | 4.92 s | 166 | 19.3 | ✓ |

**Correctness is size-independent.** Conservation, no-overlap, no-protrusion
and weight limits hold at every size tested, up to 3 200 items. Packing
density is flat at ~19 items/carton — no quality cliff.

**The synchronous ceiling is ~300 items** on a 1.5 s budget in pure Python.
Past that the solver overruns its budget.

## Two bugs this testing found

**1. Cost grew ~n^1.6.** A 1 600-item order blew a 1.5 s budget by 7.7×,
because `pack_one` offered every remaining item to every carton type. Fixed
by a `CHUNK = 120` window: only the first 120 remaining items are offered to
each carton. Nothing is dropped — items past the window are considered for
the next carton, and the ordering is already volume-descending, so the
near-term items were the right ones anyway.

**2. Fast-path carton selection collapsed.** The first version of the fast
pass took the first carton that accepted any item — i.e. first-fit-smallest,
the exact algorithm that lost to BoxPacker by 65%. At 800 items it produced
**166 cartons instead of 42**. Fixed by keeping full carton evaluation in
fast mode and cheapening only the *placement* scoring. `test_scaling.py`
now guards this with an items-per-carton floor.

## Policy: overrun rather than falsely reject

Above the ceiling the solver deliberately misses its deadline instead of
returning early with placeable items marked `NO_FITTING_CARTON`. A correct
late answer beats a wrong prompt one — a false rejection sends a real parcel
to manual handling.

Consumers can already detect this: `solver.elapsed_ms` vs
`solver.time_budget_ms` are both in the contract document. No schema change
needed.

## What this means for the client's 50–50 000 range

This is exactly why the architecture has a batch path:

| Order size | Path | Budget |
|---|---|---|
| 1–300 items | synchronous `POST /v1/solve` | 1 200 ms, honoured |
| 300–2 000 | synchronous, degraded — expect overrun | best effort |
| 2 000+ | async batch, `202 Accepted` + job id | 60 s+ |

Route on item count at the portal boundary. Sprint 1 action: ask the client
what the **p95 and p99 items-per-order** actually are. If p99 is 40, the
ceiling is irrelevant and no batch path is needed for Phase 1. If p99 is
800, the batch endpoint moves from Phase 3 into Phase 2. This single number
decides real scope, and nobody currently knows it.


---

# Phase 1 simplification (ablation)

Question asked: is this as simple as it gets? Answer, by measurement: no —
it was roughly twice the code it needed to be. `bench/ablate.py` disables
one component at a time and measures the cost in cartons.

| Configuration | Cartons | vs full | Verdict |
|---|---|---|---|
| Full system | 28 | baseline | — |
| − anytime search over orderings | 28 | **+0** | deleted |
| − consolidation pass | 28 | **+0** | deleted |
| − downsize pass | 28 | **+0** | deleted |
| − contact-area placement scoring | 28 | **+0** | deleted |
| − carton-selection search | 143 | **+115** | **kept** |

Confirmed on four structured distributions (uniform cubes, flat-pack, tall
bottles, two-size mix) as well as random orders — same answer both times.

## Head-to-head over 120 orders, 5–60 items

| | Cartons | Time |
|---|---|---|
| Simplified (162 lines) | 274 | 0.9 s |
| Complex (303 lines) | 273 | 155.8 s |
| **Delta** | **+1 (+0.4%)** | **166× faster** |

Per-case: simplified was better on 0, worse on 1, tied on 119.

**One carton in 274, for 166× the runtime and 141 extra lines.** Deleted.
Two golden fixtures (03, 09) each use one carton more than they did — that
is the whole of the 0.4%, and it is the honest price of the simplification.

## Consequences beyond line count

- **Fully deterministic.** No RNG, no wall-clock dependence. The same
  request returns the same layout on any machine, every time. This kills a
  real operational risk: a packer re-scanning an order previously could have
  seen a different arrangement from a differently-loaded server.
- **Latency vs BoxPacker went from 100× slower to 3×** (82 ms vs 27 ms
  across 20 cases). The comparison is now defensible on both axes.
- **Synchronous ceiling rose from ~300 items to ~1 000.** 400 items now
  solves in 0.49 s, 1 600 in 2.1 s.
- **`time_budget_ms` is now unused** by the solver — but stays in the
  contract, reported back in every document. Phase 2 search will use it, and
  the contract does not change when it does.

## The lesson worth putting on the mid-term slide

Every deleted component was added for a plausible reason, from the packing
literature, and each *felt* like an improvement. None survived measurement.
The one thing that mattered — evaluating every carton type against the
remaining items rather than opening the smallest that fits — is a dozen
lines. Build the benchmark before the optimisation, or you cannot tell the
difference between the two.
