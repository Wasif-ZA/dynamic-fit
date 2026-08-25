# FitPortal — MVP Frontend

Frontend-only MVP for the FitPortal sub-system (Project Perfect Fit, COMP4050).
Covers order creation and order visibility for operational users. No backend
or database is wired up yet — everything runs on in-memory mock data (see
`src/data/mockData.js` and `src/context/AppContext.jsx`).

## Stack

- React 18 + Vite
- React Router (client-side routing)
- Tailwind CSS

## Getting started

```bash
npm install
npm run dev
```

Then open the printed local URL. Sign in with any email/password (auth is
mocked — no credential check happens yet) or use "Create account".

## What's here

| Acceptance criterion | Where |
|---|---|
| App layout/navigation | `src/components/layout/AppLayout.jsx`, `Sidebar.jsx`, `TopBar.jsx` |
| Login / Register pages | `src/pages/LoginPage.jsx`, `RegisterPage.jsx` |
| Order creation page | `src/pages/OrderCreatePage.jsx` |
| Item entry components | `src/components/orders/ItemEntryForm.jsx`, `ItemsTable.jsx` |
| Order summary/details view | `src/pages/OrderSummaryPage.jsx` |
| Hazard flag in UI | `src/components/common/HazardBadge.jsx` (tag in tables, ribbon on the order summary card) + checkbox in item entry |

Item fields follow the schema shared by FitSolver: `ItemCode`, `ItemReference`,
`Width`, `Length`, `Depth` (mm), `Weight` (kg), `BoxGroup` (optional), plus a
`Hazardous` flag added for this UI and a per-line `qty`.

## Next steps (not in this MVP)

- Wire `AppContext` up to the FitPortal API instead of local state.
- Real authentication (currently any input signs you in).
- Persist orders to the database instead of resetting on reload.
- Send order items to FitSolver and surface packing results from
  FitVisualiser on the order summary page.
