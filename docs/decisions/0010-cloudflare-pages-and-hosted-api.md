# ADR-0010: Host on Cloudflare, with a hosted API and Supabase for the Portal

- **Status:** accepted
- **Date:** 2026-10-20

Decided by Aaron Minhas (GitHub `AaronMinhas`), who authored
[PR #11](https://github.com/Wasif-ZA/dynamic-fit/pull/11) ("Add Cloudflare deploy config
and hosted API support", commit `a2ceeec`, merged 2026-10-20 as `15e9404`).

## Context

Until PR #11 the repository only described a local setup. The README covers a local
Supabase stack (`supabase start --workdir apps/portal`), a local Portal backend and a local
Vite frontend. `docs/PLAN.md` lists "Deployment, docs, repo hygiene" under Phase 4
(Sprint 3), so the Portal and visualiser needed a public address.

The PR description gives the scope: "Adds config for deploying the portal and visualiser to
Cloudflare. Lets the visualiser load orders from the hosted backend. Wakes up the backend
when the portal loads. No other code changes, just deployment."

## Decision

1. **The Portal frontend and the visualiser deploy to Cloudflare as static assets.** Each
   has a `wrangler.jsonc`: `apps/portal/frontend/wrangler.jsonc` (project `dynamicfit`) and
   `apps/visualiser/wrangler.jsonc` (project `fitvisualiser`). Both use compatibility date
   2026-10-12 and serve `./dist`. Build, then `npx wrangler deploy`. The Portal config
   sends unknown paths to `index.html` because React Router handles paths in the browser.
2. **The API is hosted separately from the static sites.** Both apps read its address from
   the build-time variable `VITE_PORTAL_API_BASE`. The Portal frontend falls back to
   `http://127.0.0.1:8000` (`apps/portal/frontend/src/api/client.js`). The visualiser's
   `?solution=` loader now also accepts the origin named by that variable
   (`apps/visualiser/js/solution.js`); before, only the same origin and loopback hosts
   were allowed.
3. **The Portal keeps Supabase (PostgreSQL) for data and sign-in.** This is the existing
   design in the README and ADR-0008, not new in PR #11, which touches no Supabase file.
4. **The Portal warms the backend on load.** `warmUpApi()` in `client.js`, called from
   `main.jsx`, fires a request to `/health` so a sleeping hosted backend starts waking
   while the user signs in.

## Alternatives considered

Not recorded. Neither PR #11 nor the repository files say what other hosts were weighed or
why Cloudflare was picked. The warm-up change implies a backend host that sleeps when idle,
but the PR does not name that host.

## Consequences

- Two new deploy targets, each with its own build step. No deploy workflow exists in
  `.github/workflows/`, so deploys are manual.
- The visualiser's origin allow-list depends on a build-time variable. A build without
  `VITE_PORTAL_API_BASE` rejects the hosted API, so a deploy that forgets it fails on the
  visualiser only.
- The first request after idle may be slow. The warm-up hides that on the Portal page but
  not for a visualiser opened directly.
- Not recorded in the repo, and worth adding once known: the backend host, the hosted
  Supabase project, and who holds the deploy credentials.
