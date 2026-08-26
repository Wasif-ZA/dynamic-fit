# Dynamic Fit

Warehouse carton packing. Give it an order and the box types a warehouse stocks, and
it works out **which boxes to use** and **where each item goes inside them**, then
draws the result.

Three subsystems, one repository:

| Subsystem | Lives in | What it does |
|---|---|---|
| **FitPortal** | `apps/portal/` | Takes the order, shows the result |
| **FitSolver** | `packages/solver/` | Does the packing |
| **FitVisualizer** | `apps/visualiser/` | Draws it in 3D |

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

## How to run it

You need **Python 3.11+** and **Node 20+**. All commands below start from this
folder (the repo root). You do **not** need [uv](https://docs.astral.sh/uv/).

The website talks only to the Portal API. The API packs the order by calling the
solver as a Python library in the same process. The 3D view is a separate app
that loads the packed result. You need all three running.

### First time

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e packages/solver
pip install -r apps/portal/backend/requirements.txt
pip install jsonschema
```

On Windows, activate with `.venv\Scripts\activate` instead of `source`.

### Three terminals

Keep the venv activated in the API terminal.

**1. Portal API** — http://127.0.0.1:8000

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --app-dir apps/portal/backend
```

API docs: http://127.0.0.1:8000/docs

**2. Portal website** — http://127.0.0.1:5174

```bash
cd apps/portal/frontend
npm install
npm run dev
```

**3. 3D visualiser** — http://localhost:5173

```bash
cd apps/visualiser
npm install
npx vite
```

Open the visualiser as **`localhost`**, not `127.0.0.1`. On macOS those are
different sockets; mix them and the 3D panel is blank.

### Use it

1. Open http://127.0.0.1:5174 and sign in with any email and password (login is mocked).
2. Create an order with at least one item. The URL becomes `/orders/ORD-00N` — that ID is assigned by the API, not the browser.
3. Click **Pack this order**. The same ID is packed and drawn in 3D.
4. **Pack again** re-packs that order. It does not create a second one.

On its own, the visualiser draws a sample fixture. The packed order only appears
when the Portal embeds it (or you open
`http://localhost:5173/?solution=http://127.0.0.1:8000/orders/ORD-00N/solution`).

### Tests

From the repo root, with the venv on:

```bash
source .venv/bin/activate
pytest tests/integration
```

`pytest` with no path also runs the Portal API tests and the solver tests.

If you have uv: `uv sync --group dev` then `uv run pytest`. On OneDrive, prefix
uv commands with `UV_LINK_MODE=copy`.

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
