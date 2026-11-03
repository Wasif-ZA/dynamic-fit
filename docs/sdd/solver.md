# Solver: Software Design Description

Division: Solver (FitSolver)
Code: `packages/solver/`, developed in [Wasif-ZA/DynamicSolver](https://github.com/Wasif-ZA/DynamicSolver)
and merged here with its history ([ADR-0007](../decisions/0007-monorepo-with-preserved-history.md))
Authors: Solver team, see [`team.md`](team.md)
Last updated: 2026-10-22

## 1. Purpose and scope

Given the items in an order and the carton types a warehouse stocks, the solver decides which
cartons to use and where each item goes inside them. It returns one solution document that the
Portal stores and the visualiser draws.

It does not store orders, sign users in, or draw anything. Those are the Portal and the visualiser
([ADR-0003](../decisions/0003-solver-only-scope.md)).

## 2. Requirements

### 2.1 User stories

From the user stories in DynamicSolver (`docs/user-stories.md`, branch `docs/user-stories`). Only
the stories the solver takes part in are listed.

| ID | Story | Priority | Status |
|---|---|---|---|
| US-02 | As a supervisor handling hazardous stock, I want items that cannot travel together split into separate cartons, so that we stay compliant without a packer remembering the rules | Must | Done. Conflict groups pack separately; `test_greedy2_grouping.py` and the property tests check it |
| US-04 | As an account manager, I want packing rules per customer, so that they apply to every order automatically | Should | Solver side done: an item carries a `dg_class` and an `incompatible_with` list of item references, so a rule is data, not code. Storing rules per customer is the Portal's part |
| US-05 | As a developer connecting our warehouse system, I want a documented API that returns a packing plan, so that I can request layouts from our systems | Must | Done. `POST /v1/solve` and `POST /v1/solve/portal`, published schemas, same request gives the same result, rejects listed with a reason |

### 2.2 Functional requirements

From the client Q&A on 5 August ([`client-requirements.md`](../client-requirements.md)).

| ID | Requirement | Met by | Evidence |
|---|---|---|---|
| R1 | Items with different dangerous-goods classes, or marked incompatible, never share a carton. A legal rule, so it wins over efficiency | Conflict grouping before packing | `test_greedy2_grouping.py`, `test_properties.py` |
| R4 | Reject what cannot be packed, with a reason | Per-item rejects: `INVALID_DIMENSIONS` and `MISSING_MASS` at input, `NO_FITTING_CARTON` and `UNPLACEABLE` while packing. The rest of the order still packs | `test_contract.py` |
| R5 | Inputs: cartons with inner size, maximum mass and tare; items with a reference, size and mass | `io.parse_request` | `contract/request.schema.json` |
| R6 | Extensible, through packing modes (standard, fluid, own packaging) | Standard mode only. `engine.solve` calls one `pack` function with a fixed signature, so another mode is a new `pack` behind the same call | `Solution.mode` is reported as `"rigid"` |
| Portal request, Oct 2026 | Limit how many of each carton type one solution may use | `maximum_boxes` on a carton | DynamicSolver PR #19, `test_greedy2_max_boxes.py` |

### 2.3 Non-functional requirements

| ID | Requirement | Target | Measured | Evidence |
|---|---|---|---|---|
| R2 | Answer one order fast enough that packers keep using it | 1 to 2 s | Default budget 1,200 ms (`DEFAULT_BUDGET_MS`). Pass count comes from a measured cost table, not a clock | `test_scaling.py`, greedy2 `DESIGN_NOTES.md` |
| R3 | Small load: about 50 to 50,000 orders a day, not concurrent. No rate limiting | One request in, one response out | No queue, no throttling, by the client's instruction | [`client-requirements.md`](../client-requirements.md) R3 |
| Q1 | Use few cartons | Fewest cartons, then least carton volume | 8.7% above the exact optimum on 64 small orders without mass limits, 2.6% with realistic mass limits (Google CP-SAT as the reference) | greedy2 `README.md`, `tests/data/optima.json` |
| Q2 | Same request, same layout, on any machine | Deterministic | Seed derived from a hash of the request; no wall-clock reads during a solve | `test_greedy2_phase12.py`, `test_properties.py` |

### 2.4 Out of scope

| Not built | Why |
|---|---|
| Fragile and this-way-up | The client called it out of scope |
| Rate limiting, throttling, queues | The client said the load does not need it |
| Auth | The client has access control already; the Portal signs users in |
| Fluid and own-packaging modes | Asked for as extension points, not as features for this unit |

## 3. Architecture

```
request JSON -> io.parse_request -> engine.solve -> greedy2.pack -> io.emit_document -> solution JSON
                 (validate,          (seed from      (choose cartons,  (schema-shaped
                  early rejects)      request hash)   place items)       document)
```

The Portal calls `engine.solve` as a Python library in the same process. `api.py` exposes the same
function over HTTP for standalone use.

### 3.1 Components

| Component | File | Responsibility |
|---|---|---|
| Domain types | `domain.py` | `Item`, `Carton`, `Placement`, `PackedCarton`, `Reject`, `Solution`. Integer millimetres and grams |
| Input and output | `io.py` | Validate the request, reject bad items early, write the solution document |
| Portal adapter | `portal.py` | Translate the Portal's JSON shape into a solver request |
| Orchestration | `engine.py` | One plain function, `solve(payload) -> dict`, used by the API and every test |
| HTTP API | `api.py` | FastAPI: `GET /v1/health`, `POST /v1/solve`, `POST /v1/solve/portal` |
| Packer | `greedy2/pack.py`, `greedy2/geometry.py` | Carton choice, corner-point placement, carton removal |
| First packer | `pack.py`, `geometry.py` | v1, kept for side-by-side comparison only |

### 3.2 Interfaces with other divisions

| Direction | Division | Format | Defined in |
|---|---|---|---|
| In | Portal | Request: `order_id`, `time_budget_ms`, `items` (size, mass, quantity, allowed rotations, `dg_class`, `incompatible_with`), `cartons` | [`contract/request.schema.json`](../../contract/request.schema.json) |
| Out | Portal, then visualiser | Solution document, passed through unchanged | [`contract/solution.schema.json`](../../contract/solution.schema.json) |

Integer millimetres and grams, z-up, positions at the minimum corner, sizes as placed so the
visualiser does no rotation maths ([ADR-0002](../decisions/0002-units-and-coordinates.md)). The
implemented schema is the contract ([ADR-0006](../decisions/0006-the-implemented-schema-is-canonical.md)).

## 4. Detailed design

greedy2 in eight steps. The full reasoning, with the measurement behind every constant, is in
`packages/solver/src/fitsolver/greedy2/DESIGN_NOTES.md`.

1. **Reject what can never fit.** A table records which carton types could hold each item shape.
   Items no carton can hold, by size or by mass, are rejected up front.
2. **Canonical order.** Items are sorted by content, so the same goods in a different order give the
   same layout.
3. **Conflict groups.** Items that may never share a carton go into separate groups that pack
   independently.
4. **Lower bound.** The fewest cartons any solution could use, from total volume and mass. A pass
   that reaches it stops the solve early.
5. **Several orderings, keep the best.** Four named orderings, then seeded restarts close to
   largest-first. Best means fewest unplaced items, then fewest cartons, then least carton volume.
6. **Fill one carton at a time.** Each round, every usable carton type is test-filled and the one
   that packs the most volume is kept. Opening the smallest carton that fits was 5 to 20 times worse.
7. **Place at corner points.** Each item goes at the lowest corner where it stays inside the walls,
   overlaps nothing, and has at least 70% of its base supported.
8. **Try to remove a carton.** Empty the emptiest carton into the others, or repack the last two or
   three into one fewer. A move is only kept if it removes a carton.

Things that look like bugs and are deliberate: containment is half-open, so the top face of one box
is where the next starts; support failures are never memoised, because a later item can become the
floor; contact-area scoring exists but is switched off because it measured worse.

## 5. Design decisions and trade-offs

| Decision | Options | Chosen | Why | Cost accepted | Record |
|---|---|---|---|---|---|
| Language | C++, Python | Python | Development speed; the 1 to 2 s bar is generous for one order | Slower per pass than C++ | [ADR-0005](../decisions/0005-python-solver.md), superseding [ADR-0004](../decisions/0004-cpp-implementation.md) |
| Algorithm | Exact solver, metaheuristic, greedy | Greedy with restarts | 3D packing is NP-hard; an exact answer does not fit in 1 to 2 s | 8.7% more cartons than optimal on small orders | ADR-0009, Dynamic Fit PR #13 |
| What "good" means | Fill rate, carton count | Carton count, then volume | The client asked for fewer boxes. Fill rate rewards many small tight cartons | Fill rate is reported, never optimised | `BENCHMARK.md` |
| Over budget | Stop and reject, or finish late | Finish late | A false rejection sends a real parcel to manual handling | Large orders can exceed the budget | `BENCHMARK.md` |
| Randomness | Clock-based, seeded | Seeded from the request | The same order must look the same when a packer re-scans it | Restarts explore less than free random search | greedy2 `README.md` |
| Interface | `docs/contract.md`, implemented schema | Implemented schema | It is what the code emits and CI checks | The earlier contract doc is kept only for its reasoning | [ADR-0006](../decisions/0006-the-implemented-schema-is-canonical.md) |
| Repository | Three repos, monorepo | Monorepo with preserved history | One CI run checks all three divisions together | Solver changes are synced from DynamicSolver | [ADR-0007](../decisions/0007-monorepo-with-preserved-history.md) |
| Solution status | Consumers derive it, solver states it | Solver states `solved`, `partial` or `rejected` | One definition instead of three | One more optional field | ADR-0012, Dynamic Fit PR #15 |

## 6. Software quality

### 6.1 Testing

| Suite | Kind | Covers |
|---|---|---|
| `test_properties.py` | Property (Hypothesis) | No overlap, no protrusion, mass limits, support, conflict separation, every item placed or rejected exactly once, determinism |
| `test_contract.py` | Contract | Every document validates against `solution.schema.json` |
| `test_scaling.py` | Performance | Correctness and timing by order size |
| `test_greedy2_layouts.py` | Regression | About 2,500 recorded placements must not move |
| `test_greedy2_*.py` | Unit | Each greedy2 step, including `maximum_boxes` |
| `test_portal.py` | Adapter | The Portal's JSON shape |

Run from the repo root: `.venv/bin/python -m pytest packages/solver/tests`.

### 6.2 Continuous integration and review

Every pull request runs the tests and `ruff`. Nothing merges to `main` without a review from another
team member, and whoever writes an implementation does not write its tests
([`CONTRIBUTING.md`](../CONTRIBUTING.md)).

### 6.3 Known defects and limits

| Issue | Effect | Status |
|---|---|---|
| `packages/solver` here predates DynamicSolver PR #19 | `maximum_boxes` not yet in the monorepo | Re-sync is DynamicSolver issue #28 |
| Bug-sweep fixes (bad JSON gives 400, request validation) | Not yet merged | DynamicSolver PR #34 |
| [`architecture.md`](../architecture.md) still describes the C++ plan | Misleads a new reader | DynamicSolver issue #26 |
| Pass cost table measured on one machine | Pass count may be off on the deployed host | Re-measure on the deployment machine |

## 7. Deployment and use

Runs inside the Portal API, so deploying the Portal deploys the solver. To run it alone:
`uvicorn fitsolver.api:app --port 8000`. Full setup is in the root [`README.md`](../../README.md).

## 8. Project management

Work is tracked on the DynamicSolver GitHub Project board, "KanBan - DynamicSolver". Every issue
carries a `sprint-0` to `sprint-3` label. Merged pull requests from before the board was used were
filed as closed issues #21 to #24, and the remaining Sprint 3 work as #25 to #32.

## 9. Future work

- Fluid mode: compare total volumes and skip geometry. Add it as a second `pack` behind `engine.solve`.
- Own-packaging mode: skip packing for items that ship in their own carton.
- A batch path for very large orders, if the client's real order sizes need it.
- Re-measure `PASS_COST_MS` on the deployment machine.
