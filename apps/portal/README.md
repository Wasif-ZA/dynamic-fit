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

## Local Backend Setup

The FitPortal backend is a FastAPI application located in `backend/`.

### Requirements

- Python 3.11 or newer (tested on 3.14)

### Setup

Create and activate a virtual environment, then install dependencies:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

On Windows, activate with `.venv\Scripts\activate` instead.

### Running the API

From `backend/` with the virtual environment activated:

```bash
uvicorn app.main:app --reload
```

The API is then available at `http://127.0.0.1:8000`:

- `GET /health` — service status check
- `/docs` — interactive API documentation

### Running Tests

From `backend/` with the virtual environment activated:

```bash
pytest
```
