# Pangreksa Web Console

Next.js 16 (App Router, TypeScript strict) management UI for the Pangreksa AI Router Gateway, with a built-in **Backend-for-Frontend (BFF)**. The browser only ever calls Next.js; the BFF (Route Handlers under `app/api/`) mediates every call to the central-server.

The UI is the Claude Design handoff ported faithfully: plain-CSS Carbon-derived design tokens (light/dark + accent + density), and dependency-free hand-built SVG charts — **no component or chart library**.

## Quick start

```bash
cp .env.local.example .env.local      # CENTRAL_SERVER_URL=http://localhost:10000 (server-only)
npm install
npm run dev                            # http://localhost:3000
```

Sign in via the **API key** path with a raw key whose SHA-256 matches an active `api_keys.key_hash`. Create new keys in **Administration → API Tokens** (raw key shown once).

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) on :3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` (strict) |

## Environment

| Variable | Default | Notes |
|---|---|---|
| `CENTRAL_SERVER_URL` | `http://localhost:10000` | **Server-only** upstream URL. Never `NEXT_PUBLIC_` — the browser must not know it. |

## Architecture

```
Browser ──/api/*──▶ Next.js Route Handlers (BFF) ──X-API-Key──▶ central-server :10000 ──▶ PostgreSQL
```

### BFF endpoints (`app/api/`)

| Route | Responsibility |
|---|---|
| `auth/route.ts` | `POST` login (hash key → match → set `pat` HttpOnly cookie) · `DELETE` logout · `GET` session (`SessionUser`) |
| `v1/[...path]/route.ts` | Generic proxy for all 34 resources — injects `X-API-Key`, **re-validates** write bodies, mirrors upstream status |
| `aggregate/[metric]/route.ts` | Server-side rollups (cost-by-day, requests-by-model, latency-percentiles, heat-strip, violations-by-rule), paginating past the 500-row cap |
| `stream/route.ts` | SSE bridge polling `request-logs` every 5 s |

## Project layout

```
app/
  layout.tsx                 ThemeProvider + globals.css
  login/page.tsx             API-key + Entra/AD (stubs) sign-in
  (dashboard)/
    layout.tsx               server cookie auth gate → DashboardShell
    overview · model-metrics · guardrail-activity · logs · dimensional
    virtual-models · providers · prompts · mcp · skills
    guardrails · pii · budgets · rate-limits
    users · org · auth · tokens · config
  api/                       the BFF (auth, v1 proxy, aggregate, stream)
components/
  shell/                     AppHeader, SideNav, CommandPalette (⌘K), Tweaks, DashboardShell
  charts/                    Line, Bar, Donut, Sparkline, HeatStrip, LiveLine, Sankey (SVG)
  ui/                        Btn, Tag, Modal, Field, DataTable, … + screen helpers
  common/ResourceCrud.tsx    reusable table + add/edit/delete + validation
  Icon.tsx · org/
lib/
  api/{client,resources,aggregations}.ts · validation/ · types/
  theme.tsx · session.ts · hooks.ts · sse.ts · seed.ts (fallback)
```

## Data strategy

- **List / CRUD screens** are wired to live central-server data through the BFF.
- **Dashboards** use BFF server-side aggregates (`useAggregate`), with the design's seed (`lib/seed.ts`) as SWR `fallbackData` so nothing blanks.
- A few analytical views (Dimensional Viewer, Model Metrics) and provider/auth panels use seed data where the CRUD API has no equivalent — see [`../web-console-implemented.md`](../web-console-implemented.md).

## CRUD + validation

`components/common/ResourceCrud.tsx` powers create/edit/delete for any resource from field definitions. `lib/validation/index.ts` holds per-resource rules enforced **both** client-side (inline errors) and in the BFF proxy (so direct calls can't bypass them). Mapping UIs (role→permissions, role→skills) batch link-row writes.

## Notes & gotchas

- PostgreSQL `NUMERIC` columns serialize as **strings** — always `Number()` before math.
- Charts render **client-only** (a `useMounted()` gate) to avoid SVG float hydration mismatches.
- Some upstream columns are `NOT NULL` without a form field — the BFF backfills (e.g. `users.external_id` ← email).
