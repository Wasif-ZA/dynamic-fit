# FitPortal

FitPortal is the customer-facing component of **Dynamic Fit**, a system for creating packing orders, optimising how items are packed into boxes, and visualising the resulting packing solution.

This repository contains the standalone FitPortal frontend and backend.

The complete integrated Dynamic Fit application is maintained in the **Dynamic Fit monorepo**:

**https://github.com/Wasif-ZA/dynamic-fit**

## Dynamic Fit

Dynamic Fit consists of three main components:

- **FitPortal** - Customer-facing interface, order management and API.
- **FitSolver** - Calculates optimised packing solutions.
- **FitVisualiser** - Displays packing solutions in 3D.

The current application flow is:

```text
FitPortal Frontend
        ↓
FitPortal API
        ↓
FitSolver
        ↓
FitPortal API
        ↓
FitVisualiser
```

FitPortal's backend integrates with FitSolver directly as a Python package. A separate Solver server is not required.

The complete Portal, Solver and Visualiser integration is available through the Dynamic Fit monorepo:

**https://github.com/Wasif-ZA/dynamic-fit**

## Repository Structure

```text
comp4050-portal/
├── backend/
│   ├── app/
│   │   ├── db/                 SQLAlchemy persistence models
│   │   ├── repositories/       PostgreSQL reads and writes
│   │   ├── routes/             FastAPI routers
│   │   └── database.py         Engine and session lifecycle
│   ├── scripts/                 Initial account bootstrap
│   ├── tests/
│   ├── .env.example
│   ├── requirements.txt
│   └── requirements-standalone.txt
├── frontend/
│   ├── src/
│   └── .env.example
├── supabase/
│   ├── config.toml
│   └── migrations/             Authoritative database schema
└── README.md
```

### Backend

The backend is a Python FastAPI application responsible for:

- creating and retrieving orders
- validating Portal data
- persisting orders, order items, Box Inventory and packing solutions in PostgreSQL
- converting Portal orders into the FitSolver input format
- executing packing requests through FitSolver
- storing packing solutions, and
- exposing packing results for the frontend and FitVisualiser.

FastAPI owns all application state. The frontend never reads or writes the
database directly, and no database credentials are exposed to the browser.

### Frontend

The frontend provides the FitPortal user interface for:

- creating and editing orders
- viewing existing orders
- viewing order items and packing status
- submitting orders for packing
- displaying packing results, including the box group of each packed box and item
- managing Box Inventory (create, edit, delete and `boxes.json` import), and
- managing Portal user accounts.

## Local Development with Local Supabase

These instructions use the Supabase services running locally through Docker.
They do not connect FitPortal to a hosted Supabase project.

Complete the following steps in order. Unless a step says to open another
terminal, run every command from the repository root.

### Prerequisites

- Python 3.12 or newer
- Node 18 or newer and npm
- A Docker compatible container runtime such as Docker Desktop
- The [Supabase CLI](https://supabase.com/docs/guides/local-development)

### Step 1: Install the Backend Environment

Create the project virtual environment and install the backend dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements-standalone.txt
```

FitSolver is installed from the Dynamic Fit monorepo by
`backend/requirements-standalone.txt`.

### Step 2: Start Local Supabase

Make sure Docker is running, then start the local Supabase stack:

```bash
supabase start
```

This starts the local PostgreSQL and Auth services and applies every migration
in `supabase/migrations/`. Print the local configuration values:

```bash
supabase status -o env
```

### Step 3: Configure the Backend for Local Supabase

Copy the backend environment template:

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and map the values from `supabase status -o env` exactly as
shown below:

```text
DATABASE_URL=<DB_URL>
SUPABASE_URL=<API_URL>
SUPABASE_SECRET_KEY=<SECRET_KEY>
SUPABASE_JWKS_URL=http://127.0.0.1:54321/auth/v1/.well-known/jwks.json
VISUALIZER_TOKEN_SECRET=<stable random value containing at least 32 characters>
PORTAL_PUBLIC_API_URL=http://127.0.0.1:8000
```

Use the modern `SECRET_KEY` value beginning with `sb_secret_`. Do not use the
legacy JWT-formatted `SERVICE_ROLE_KEY`. Keep `backend/.env` local and never
commit it.

### Step 4: Create the Local Test Accounts

Run the following commands from the repository root. Keep the virtual
environment created in Step 1. The explicit `.venv/bin/python` path prevents the
system Python from being used accidentally.

```bash
export BOOTSTRAP_ADMIN_EMAIL=admin@local.test
export BOOTSTRAP_ADMIN_PASSWORD='localtest'
export BOOTSTRAP_SUPERVISOR_EMAIL=supervisor@local.test
export BOOTSTRAP_SUPERVISOR_PASSWORD='localtest'
.venv/bin/python backend/scripts/bootstrap_users.py
```

These credentials are for local testing only. Do not reuse them with hosted
Supabase. The bootstrap is idempotent, so running it again leaves existing
accounts with the expected roles unchanged.

### Step 5: Start the Backend

From the repository root, run:

```bash
.venv/bin/python -m uvicorn app.main:app --reload --app-dir backend
```

The API is available at `http://127.0.0.1:8000`. Interactive API documentation
is available at `http://127.0.0.1:8000/docs`.

The backend refuses to start when its database or authentication configuration
is missing or unreachable.

### Step 6: Configure the Frontend for Local Supabase

Open another terminal at the repository root. Copy the frontend environment
template:

```bash
cp frontend/.env.example frontend/.env
```

Set `VITE_SUPABASE_PUBLISHABLE_KEY` in `frontend/.env` to the
`PUBLISHABLE_KEY` printed by `supabase status -o env`. The browser receives only
this public key. It must never receive `SUPABASE_SECRET_KEY`.

### Step 7: Start the Frontend

From the repository root, run:

```bash
npm --prefix frontend install
npm --prefix frontend run dev
```

The frontend is available at `http://127.0.0.1:5174`. Sign in using either local
test account created in Step 4.

### Resetting Local Supabase

The following command deletes all local data and reapplies the migrations:

```bash
supabase db reset
```

Run Step 4 again after a reset because Auth identities and Portal account rows
are deleted. A fresh local database contains no orders, solutions or box
inventory. Populate inventory through the Box Inventory page by importing
`boxes.json`.

To apply new migrations to an existing local database without deleting data:

```bash
supabase migration up
```

## FitSolver Integration

FitSolver is installed by `backend/requirements-standalone.txt`.

The standalone requirements file installs the standard Portal dependencies and then installs the FitSolver Python package from:

**https://github.com/Wasif-ZA/dynamic-fit/tree/main/packages/solver**

This allows the following workflow to be tested directly from this repository:

```text
FitPortal Frontend
        ↓
FitPortal API
        ↓
FitSolver
        ↓
Packing Result
        ↓
FitPortal Frontend
```

FitSolver runs in-process with the Portal backend. There is no separate Solver API or server to start.

## FitVisualiser Integration

FitVisualiser is maintained as part of the Dynamic Fit monorepo:

**https://github.com/Wasif-ZA/dynamic-fit/tree/main/apps/visualiser**

FitVisualiser is not included in this standalone repository.

The Visualizer cannot attach the Portal bearer token when it fetches a URL.
FitPortal therefore issues a short-lived token scoped to the current order and
exact saved solution. Normal solution and summary endpoints remain protected,
and the Supabase access token is never placed in a URL.

The Portal frontend expects FitVisualiser to be running at:

```text
http://localhost:5173
```

Without FitVisualiser running, order creation, packing and packing summaries will continue to work, but the embedded 3D visualisation will not be available.

To run and test the complete Portal → Solver → Visualiser workflow, use the Dynamic Fit monorepo:

**https://github.com/Wasif-ZA/dynamic-fit**

## API

The current Portal API provides the following routes:

| Method | Route | Access | Purpose |
|---|---|---|---|
| `GET` | `/health` | Public | API health check |
| `GET` | `/docs` | Public | Interactive OpenAPI documentation |
| `GET` | `/auth/me` | Signed-in user | Retrieve the current Portal profile |
| `POST` | `/orders` | Signed-in user | Create an order |
| `GET` | `/orders` | Signed-in user | List orders |
| `GET` | `/orders/{id}` | Signed-in user | Retrieve an order |
| `PUT` | `/orders/{id}` | Signed-in user | Replace an order's items |
| `POST` | `/orders/{id}/submit` | Signed-in user | Submit a draft order for optimisation |
| `POST` | `/orders/{id}/solve` | Supervisor or Administrator | Pack an order using FitSolver |
| `POST` | `/orders/{id}/finalise` | Supervisor or Administrator | Finalise an order and consume inventory |
| `GET` | `/orders/{id}/solution` | Signed-in user | Retrieve the packing solution |
| `GET` | `/orders/{id}/solution/summary` | Signed-in user | Retrieve the packing summary |
| `POST` | `/orders/{id}/visualizer-handoff` | Signed-in user | Create a scoped visualizer URL |
| `GET` | `/orders/{id}/solution/visualizer` | Scoped handoff token | Retrieve a solution for FitVisualizer |
| `GET` | `/boxes` | Signed-in user | List box inventory |
| `GET` | `/boxes/{reference}` | Signed-in user | Retrieve a box type |
| `POST` | `/boxes` | Supervisor or Administrator | Create a box type |
| `PUT` | `/boxes/{reference}` | Supervisor or Administrator | Update a box type |
| `DELETE` | `/boxes/{reference}` | Supervisor or Administrator | Permanently delete a box type |
| `POST` | `/boxes/import` | Supervisor or Administrator | Import reviewed box inventory |
| `GET` | `/users` | Supervisor or Administrator | List Portal accounts |
| `POST` | `/users` | Supervisor or Administrator | Create a Portal account |
| `PUT` | `/users/{id}` | Supervisor or Administrator | Update a Portal account |
| `POST` | `/users/{id}/disable` | Supervisor or Administrator | Disable a Portal account |
| `POST` | `/users/{id}/enable` | Supervisor or Administrator | Enable a Portal account |
| `DELETE` | `/users/{id}` | Supervisor or Administrator | Delete a Portal account |

Order IDs are generated by the Portal API using the `ORD-###` format.

`ItemCode` is the client's own identifier. Any non-blank text is accepted and
stored as given, apart from trimming surrounding whitespace.

## Testing

The backend suite runs against a real PostgreSQL database, because it covers
transactions, row locking and sequence-backed identity.

Start the local Supabase stack first, then run the suite:

```bash
supabase start
```

```bash
pytest backend/tests
```

The suite creates and migrates its own `fitportal_test` database on the same
server as `DATABASE_URL`, rebuilding the schema from `supabase/migrations/` on
every run.

Because the suite drops and recreates its schema, it refuses to run against a
non-local database host. Set `FITPORTAL_TEST_DATABASE_URL` to override the
target, and never point it at a shared or hosted Supabase project.

The tests cover:

- API health
- Portal data models and validation
- order creation and retrieval
- Portal-to-Solver data conversion
- Solver integration
- packing API routes
- persistence across database sessions and backend restarts
- sequence-backed OrderId and Reference generation
- transaction boundaries for order creation, order editing, box import and finalisation
- row locking, so concurrent finalisations cannot oversubscribe Box Inventory.

The frontend has Vitest unit tests for item and box validation (including the
box import Add/Replace rules) and the box group labels in Packing Details:

```bash
cd frontend
npm test
```

## Persistence

### Architecture

```text
React
    ↓
FastAPI routes
    ↓
domain modules (store, boxes, finalisation)
    ↓
repositories
    ↓
SQLAlchemy + psycopg
    ↓
PostgreSQL (Supabase)
```

Routes and domain code never contain SQL. Repositories convert between database
rows and the Pydantic API models, so the API schema and the database schema stay
independent. PostgreSQL columns are `snake_case`, the API contract remains
PascalCase.

### Schema

The authoritative schema lives in `supabase/migrations/`.

| Table | Contents |
|---|---|
| `orders` | OrderId, Reference, lifecycle Status, CreatedAt |
| `order_items` | Each order's items, with an explicit `position` |
| `box_types` | Deployment-wide Box Inventory |
| `solutions` | The one active FitSolver document per order, as JSONB |
| `portal_users` | Supabase identity mapping, authoritative Portal role and status |

`order_id_sequence` and `order_reference_sequence` generate `ORD-001` and
`MQ-001`. Because PostgreSQL sequences are not rolled back by a failed
transaction, reference gaps such as `MQ-001`, `MQ-003` are expected and
accepted. Uniqueness and concurrency safety matter more than gapless numbering.

### Box quantities

`MaximumBoxes` is the quantity of a box type available to use, as defined by the
client's box schema:

| MaximumBoxes | Meaning |
|---|---|
| Omitted or `null` | No quantity limit |
| `0` | None available |
| Positive number | That many available |

A box type is offered to the Solver when it is active and has no limit or a
quantity above 0. Finalising an order subtracts the boxes the solution uses from
a set quantity. Boxes with no limit are never changed.

Importing `boxes.json` never asks for extra values. A box without MaximumBoxes
imports with no limit. For an existing box, the file's value replaces the current
one, except when both have a quantity: the review then asks whether to Replace
the current quantity or Add the imported quantity to it.

Deleting a box type removes it permanently. Solutions store box references as
text, so final orders keep their solutions. An optimised order whose solution
uses a deleted box type cannot be finalised until it is re-optimised or the box
type is added back. Deactivating a box type keeps it out of packing without
deleting it.

### Authentication and role-based access control

FastAPI is the only trusted writer. The browser never receives PostgreSQL
credentials, and React never reads or writes these tables directly.

React signs in with Supabase email/password Auth and sends the access token to
FastAPI as a bearer token. FastAPI verifies it, maps the Auth UUID to
`portal_users`, and applies the database role and account status. Token metadata
cannot grant Portal permissions, and disabled accounts are rejected even while
their Supabase session remains cryptographically valid.

Users can work with orders and read inventory. Supervisors additionally run the
Solver, finalise orders, manage inventory, and manage USER accounts.
Administrators can also manage SUPERVISOR accounts. FastAPI prevents any change
that would leave no active Administrator.

Row Level Security is not the application authorisation layer because the
backend connects with its own database credential and owns all policy checks.

## Development Workflow

Development work is managed using GitHub Issues and the FitPortal GitHub Project board. To be implemented.

The team follows a branch and pull-request workflow:

1. Select an issue from the current sprint.
2. Assign the issue before beginning development.
3. Create a branch for the issue.
4. Implement and test the change.
5. Open a pull request targeting `main`.
6. Link the pull request to the relevant issue.
7. Have another team member review and approve the pull request.
8. Squash merge the approved pull request into `main`.

Direct changes to `main` are restricted.

## Monorepo Integration

FitPortal is also maintained as the Portal component of the Dynamic Fit monorepo:

**https://github.com/Wasif-ZA/dynamic-fit/tree/main/apps/portal**

Within the monorepo, FitSolver is available locally under `packages/solver`. The monorepo therefore installs the local Solver package rather than using the standalone Portal dependency

`backend/requirements-standalone.txt` exists specifically so this repository can independently run and test Portal-to-Solver integration.

For development and testing of the complete Dynamic Fit system, use the monorepo:

**https://github.com/Wasif-ZA/dynamic-fit**
