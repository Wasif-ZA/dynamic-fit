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

You need:

- **Python 3.11+**
- **Node 20+** and npm
- **Docker Desktop** (or another Docker runtime), running
- The [Supabase CLI](https://supabase.com/docs/guides/local-development)

Run every command from this folder (the repo root) unless a step says otherwise. You do
**not** need [uv](https://docs.astral.sh/uv/).

The website talks only to the Portal API. The API stores orders, box inventory and
users in a local Supabase (PostgreSQL) database, signs users in with Supabase Auth, and
packs orders by calling the solver as a Python library in the same process. The 3D view
is a separate app that loads the packed result. You need the database and all three
apps running.

### First time

**1. Install the Python environment** (solver, Portal backend and test tools):

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e packages/solver -r apps/portal/backend/requirements.txt pytest jsonschema hypothesis
```

On Windows, use `.venv\Scripts\python` in place of `.venv/bin/python`.

If you use uv, `uv sync --group dev` builds the same environment, and `uv run` works in
place of `.venv/bin/python`.

**2. Start the local database and auth.** The Supabase project lives in
`apps/portal/supabase`. This applies every migration:

```bash
supabase start --workdir apps/portal
supabase status --workdir apps/portal -o env
```

`--workdir` is relative to the folder you are in, so run these from the repo root. To
wipe the database and reapply the migrations later, use
`supabase db reset --workdir apps/portal`.

**3. Configure the backend.** Copy the template:

```bash
cp apps/portal/backend/.env.example apps/portal/backend/.env
```

Fill it in from `supabase status` output:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `DB_URL` |
| `SUPABASE_URL` | `API_URL` |
| `SUPABASE_SECRET_KEY` | `SECRET_KEY` (the one starting `sb_secret_`, not the legacy `SERVICE_ROLE_KEY`) |
| `SUPABASE_JWKS_URL` | Leave as `http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` |
| `VISUALIZER_TOKEN_SECRET` | Any random value of at least 32 characters |
| `PORTAL_PUBLIC_API_URL` | Leave as `http://127.0.0.1:8000` |

**4. Configure the website.** Copy the template:

```bash
cp apps/portal/frontend/.env.example apps/portal/frontend/.env
```

Set `VITE_SUPABASE_PUBLISHABLE_KEY` to `PUBLISHABLE_KEY` from `supabase status`. Leave the
other values as they are. The browser only ever gets this public key.

**5. Create the first accounts.** There is no sign-up page so this creates an
Administrator and a Supervisor, and is safe to run again:

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@local.test
export BOOTSTRAP_ADMIN_PASSWORD='localtest'
export BOOTSTRAP_SUPERVISOR_EMAIL=supervisor@local.test
export BOOTSTRAP_SUPERVISOR_PASSWORD='localtest'
.venv/bin/python apps/portal/backend/scripts/bootstrap_users.py
```

These credentials are for local use only. Further accounts are created from the Users
page in the Portal.

### Three terminals

**1. Portal API** — http://127.0.0.1:8000 (docs at http://127.0.0.1:8000/docs)

```bash
.venv/bin/python -m uvicorn app.main:app --reload --app-dir apps/portal/backend
```

The API refuses to start if the database or auth settings are missing or unreachable.

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

1. Open http://127.0.0.1:5174 and sign in with an account from step 5.
2. A new database has no boxes. On **Box Inventory**, import a `boxes.json` or add box
   types by hand.
3. Create an order with at least one item, then click **Submit for Optimisation**.
4. As a Supervisor or Administrator, click **Run Optimisation**. The packing result and
   the 3D view appear on the order page.
5. **Re-optimise** packs the same order again with the current inventory.
   **Finalise Order** locks the order and subtracts the boxes used from any box type
   with a set quantity. An order with unpacked items cannot be finalised.

On its own, the visualiser draws a sample fixture. Packed orders reach it through a
short-lived link the Portal creates, so the Portal's normal solution URLs cannot be
opened directly in the visualiser.

### Tests

From the repo root:

```bash
.venv/bin/python -m pytest packages/solver/tests tests/integration
```

The Portal backend suite needs the local Supabase stack from step 2 running. It builds
and migrates its own `fitportal_test` database and refuses to run against a non-local
host:

```bash
.venv/bin/python -m pytest apps/portal/backend/tests
```

`.venv/bin/python -m pytest` with no path runs all three suites. Website unit tests:

```bash
cd apps/portal/frontend
npm test
```

To wipe local data and reapply the migrations, run
`supabase db reset --workdir apps/portal`, then repeat step 5.

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
| `apps/portal/backend/tests/` | Orders, box inventory, users, auth, finalisation and the solve routes, against a real PostgreSQL database. Needs local Supabase |
| `apps/portal/frontend/` | `npm test`: item and box validation, box import rules, box group labels |
| `tests/integration/` | The Portal app starts alongside the solver, and every committed fixture satisfies every field `visualiser.js` actually reads. The Portal-to-visualiser checks that needed a database have been removed for now |
| `apps/visualiser/` | `npx vite build` |

`tests/integration/renderer_contract.mjs` extracts the field list from the renderer's
own source rather than hard-coding it, so a rename on either side fails the build
instead of showing `undefined` in the legend.
