# Dynamic Fit

Warehouse carton packing. Give it an order and the box types a warehouse stocks, and
it works out **which boxes to use** and **where each item goes inside them**, then
draws the result.

Three subsystems, one repository:

| Subsystem | Lives in | Owner | What it does |
|---|---|---|---|
| **FitPortal** | `apps/portal/` | @AaronMinhas | Takes the order, shows the result |
| **FitSolver** | `packages/solver/` | @Wasif-ZA | Does the packing |
| **FitVisualizer** | `apps/visualiser/` | @sweetpea004 | Draws it in 3D |

    FitPortal  ->  FitSolver  ->  FitPortal  ->  FitVisualizer

## Start here

| Doc | What it covers |
|---|---|
| [`contract/`](contract/) | **The interface.** `request.schema.json` and `solution.schema.json` are what the subsystems actually exchange |
| [`docs/client-requirements.md`](docs/client-requirements.md) | What the client asked for |
| [`docs/BENCHMARK.md`](docs/BENCHMARK.md) | How well it packs, measured against a baseline |
| [`docs/decisions/`](docs/decisions/) | The decision log. Read before re-opening a settled question |
| [`docs/contract.md`](docs/contract.md) | The reasoning behind the interface. **Superseded**: its field names were never implemented ([ADR-0006](docs/decisions/0006-the-implemented-schema-is-canonical.md)) |
| [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) | Branching, PRs, and how we log work for the unit |

## Running it

Python 3.11 or newer, Node 20 or newer. [uv](https://docs.astral.sh/uv/) manages the
Python side.

```bash
uv sync --group dev
```

On OneDrive, prefix uv commands with `UV_LINK_MODE=copy`: hardlinks fail there with
OS error 396.

**Everything, in one run:**

```bash
uv run pytest
```

That is the point of the merge. Each subsystem's own tests passed for months while the
three disagreed about field names, because nothing ran them together.

**The Portal API:**

```bash
cd apps/portal/backend && uvicorn app.main:app --reload
```

`POST /orders` to create one, `POST /orders/{id}/solve` to pack it, then
`GET /orders/{id}/solution` for the document the visualiser renders. Interactive docs
at `/docs`.

**The solver on its own**, over its own HTTP surface:

```bash
uv run uvicorn fitsolver.api:app --port 8000
curl -X POST localhost:8000/v1/solve -H 'content-type: application/json' -d @contract/fixtures_request_example.json
```

`/v1/solve/portal` is the same solver taking the Portal's field names instead.

**The visualiser:**

```bash
cd apps/visualiser && npm install && npx vite
```

It reads whichever solution file `index.html` points its canvas at, so any file in
`contract/fixtures/` works, as does a document saved from `GET /orders/{id}/solution`.

## Layout

```
apps/portal/          FitPortal: FastAPI backend, React front end
apps/visualiser/      FitVisualizer: Three.js renderer
packages/solver/      FitSolver: the packing engine, its tests, its benchmarks
contract/             The JSON Schemas and eleven fixtures
docs/                 Requirements, architecture, benchmark, decision log
tests/integration/    The only tests that span more than one subsystem
scripts/              Repository assembly
```

## The interface

Everything crossing a subsystem boundary is
[`contract/solution.schema.json`](contract/solution.schema.json). Integer millimetres,
integer grams, z-up, origin at the minimum corner, and a solution document a renderer
can draw with no further network calls.

Changing it changes someone else's sprint:

1. **Additive changes are cheap.** A new optional field breaks nobody. Just do it.
2. **Breaking changes need a heads-up.** Renaming or removing a field, or changing a
   meaning, goes to the Portal and visualiser owners before it merges. `CODEOWNERS`
   makes that a review requirement.
3. **Update the fixtures in the same commit.** A fixture that contradicts the schema is
   worse than no fixture, because someone is building against it right now.

## Tests

| Suite | Covers |
|---|---|
| `packages/solver/tests/` | The engine. Schema conformance, Hypothesis property tests over random orders, the Portal adapter, scaling |
| `apps/portal/backend/tests/` | The order API and the solve routes |
| `tests/integration/` | Portal to solver to visualiser, end to end. Includes a check that a Portal-built solution satisfies every field `visualiser.js` actually reads |
| `apps/visualiser/` | `npx vite build` |

`tests/integration/renderer_contract.mjs` extracts the field list from the renderer's
own source rather than hard-coding it, so a rename on either side fails the build
instead of showing `undefined` in the legend.
