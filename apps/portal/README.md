# FitPortal

FitPortal is the customer-facing component of the Dynamic Fit project. It provides the interface through which users interact with the system and coordinates with the other Dynamic Fit components to support the overall packing optimisation workflow.

## Dynamic Fit

Dynamic Fit is divided into three subteams, each responsible for a major component of the system:

- **FitPortal** — Provides the customer-facing application and coordinates the overall user workflow.
- **FitSolver** — Processes packing optimisation requests and returns optimised packing solutions.
- **FitVisualizer** — Provides a visual representation of the optimised packing solution.

The intended high-level interaction between these components is:

`FitPortal → FitSolver → FitPortal → FitVisualizer`

Integration standards and shared interfaces between these components will be documented as they are defined.

## Repository Purpose

This repository contains the source code and documentation for FitPortal.

It also acts as the primary reference point for other Dynamic Fit subteams integrating with FitPortal. Shared integration documentation, API specifications and stable releases will be made available through this repository as development progresses.

## Development Status

FitPortal is currently in **Sprint 1**.

Sprint 1 is focused on delivering an integrated minimum viable product (MVP) that demonstrates the end-to-end Dynamic Fit workflow.

The intended MVP flow is:

`FitPortal → FitSolver → FitPortal → FitVisualizer`

Current Sprint 1 work includes establishing the Python backend and API, integrating Supabase, developing the minimum Portal interface, and completing integration with FitSolver and FitVisualizer.

## Project Management

Development work is managed through the FitPortal GitHub Project board using a Scrum-based workflow.

Issues represent items in the Product Backlog and are assigned to Sprints through the project board.

## Contribution Workflow

Development follows a branch and pull-request workflow:

1. Select or create a GitHub Issue for the work.
2. Create a branch for the issue.
3. Make and commit changes on the branch.
4. Open a pull request targeting `main`.
5. Have the pull request reviewed and approved by another team member.
6. Squash merge the approved pull request into `main`.

Direct changes to `main` are restricted.

## How to run it

Full setup (venv, solver install, three terminals) is in the [monorepo README](../../README.md).
Do that from the **repo root**, not from this folder. Summary:

| What | URL |
|---|---|
| Portal API | http://127.0.0.1:8000 |
| Portal website | http://127.0.0.1:5174 |
| 3D visualiser | http://localhost:5173 |

The website is on 5174 so the visualiser can keep 5173. Use `localhost` for the
visualiser, not `127.0.0.1`, or the 3D panel will be blank.

The API packs by importing the solver in-process. You do not start a solver server.

API routes: `POST /orders` (assigns `ORD-###`), `GET /orders`, `GET /orders/{id}`,
`POST /orders/{id}/solve`, `GET /orders/{id}/solution`, `GET /orders/{id}/solution/summary`,
`GET /health`, `/docs`.

Sign in with any email and password. Create an order, then **Pack this order**.
**Pack again** re-packs the same ID.

Portal-only tests, from the repo root with the venv on:

```bash
pytest apps/portal/backend/tests
```
