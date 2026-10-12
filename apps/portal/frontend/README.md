# FitPortal Frontend

Authenticated UI for FitPortal. Order creation, inventory, user management,
packing and FitVisualizer integration all use the Portal API. Supabase Auth
establishes the browser session, but the browser never accesses the Portal
database or FitSolver directly.

## Stack

- React 18 + Vite
- React Router (client-side routing)
- Tailwind CSS

## Getting started

Follow the [repository setup](../README.md) first. Local Supabase and the Portal
API must already be running. FitVisualizer is optional unless you need the 3D
visualisation.

```bash
cp .env.example .env
npm install
npm run dev
```

Set `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` to the `PUBLISHABLE_KEY` printed by
`supabase status -o env`. The frontend must receive only the public
`sb_publishable_...` key, never `SUPABASE_SECRET_KEY`.

The app runs at `http://127.0.0.1:5174`. Sign in using an account created by the
local bootstrap process documented in the repository README. API, visualiser and
Supabase URLs are configured through:

- `VITE_PORTAL_API_BASE`
- `VITE_VISUALISER_BASE`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Vite embeds these values at build time, so hosted values must be set before the
frontend is built and deployed.

## What's here

| Acceptance criterion | Where |
|---|---|
| App layout/navigation | `src/components/layout/AppLayout.jsx`, `Sidebar.jsx`, `TopBar.jsx` |
| Supabase email/password login | `src/pages/LoginPage.jsx`, `src/auth/supabase.js` |
| Portal API client | `src/api/client.js` |
| Order creation page | `src/pages/OrderCreatePage.jsx` |
| Item entry components | `src/components/orders/ItemEntryForm.jsx`, `ItemsTable.jsx` |
| Order list / details | `src/pages/OrdersListPage.jsx`, `OrderSummaryPage.jsx` |
| Box Inventory (create, edit, delete) and reviewed JSON import | `src/pages/BoxInventoryPage.jsx`, `src/components/boxes/BoxJsonImport.jsx`, `src/lib/boxValidation.js` |
| Role-based user management | `src/pages/UserManagementPage.jsx` |
| Pack and visualise | `OrderSummaryPage.jsx` (calls `POST /orders/{id}/solve`, embeds FitVisualizer) |
| Packing details with box group per box and item | `src/components/orders/PackingDetails.jsx`, `src/lib/boxGroups.js` |

Item fields match the Portal API: `ItemCode`, `ItemReference`, `Width`,
`Length`, `Depth` (mm), `Weight` (kg), `BoxGroup` (optional) and `Quantity`.
`ItemCode` accepts any non-blank text. The backend assigns `OrderId`. 
`BoxGroup` is the client-defined way to keep items apart.

Box fields: `Reference`, `Width`, `Length`, `Depth`, `MaxWeight`, `BoxWeight`,
`Active` (defaults to true) and `MaximumBoxes` (available quantity, where
omitted means no limit).

## Testing

Unit tests for the validation and box group logic in `src/lib` run with Vitest:

```bash
npm test
```

Supabase access tokens are sent only to the Portal API as bearer tokens. Portal
roles and account status come from the backend's `portal_users` table, not from
editable browser state or token metadata.
