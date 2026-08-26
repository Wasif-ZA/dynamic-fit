# FitPortal — MVP Frontend

Customer-facing UI for FitPortal. Order creation, the order list, packing, and
the FitVisualizer embed all talk to the Portal API. The browser never talks to
FitSolver: the backend translates a Portal order into a solver request.

## Stack

- React 18 + Vite
- React Router (client-side routing)
- Tailwind CSS

## Getting started

The Portal API must already be running at `http://127.0.0.1:8000`, and the
visualiser at `http://localhost:5173`. See the [monorepo README](../../../README.md).

```bash
npm install
npm run dev
```

The app is at `http://127.0.0.1:5174`. Sign in with any email/password (auth is
mocked — no credential check happens yet) or use "Create account".

API and visualiser URLs default in `src/api/client.js`. Override with `VITE_PORTAL_API_BASE` or `VITE_VISUALISER_BASE` only if you need different hosts.

## What's here

| Acceptance criterion | Where |
|---|---|
| App layout/navigation | `src/components/layout/AppLayout.jsx`, `Sidebar.jsx`, `TopBar.jsx` |
| Login / Register pages | `src/pages/LoginPage.jsx`, `RegisterPage.jsx` |
| Portal API client | `src/api/client.js` |
| Order creation page | `src/pages/OrderCreatePage.jsx` |
| Item entry components | `src/components/orders/ItemEntryForm.jsx`, `ItemsTable.jsx` |
| Order list / details | `src/pages/OrdersListPage.jsx`, `OrderSummaryPage.jsx` |
| Pack and visualise | `OrderSummaryPage.jsx` (calls `POST /orders/{id}/solve`, embeds FitVisualizer) |
| Hazard flag in UI | `src/components/common/HazardBadge.jsx` (tag in tables, ribbon on the order summary card) + checkbox in item entry |

Item fields match the Portal API: `ItemCode`, `ItemReference`, `Width`,
`Length`, `Depth` (mm), `Weight` (kg), `BoxGroup` (optional), `Quantity`,
`Hazardous`. The backend assigns `OrderId`.

## Next steps (not in this MVP)

- Real authentication (currently any input signs you in).
- Persist orders to the database instead of resetting when the API restarts
  (Portal issue #30).
