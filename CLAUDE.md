# CLAUDE.md — Architecture Guidance

This file documents architectural decisions, known constraints, and guidance for AI-assisted development on this project.

## Project Structure

```
central-server/   Go REST API (port 10000)
web-console/      Next.js 16 (App Router) management UI + BFF (port 3000)
docs/             API docs, DB docs, schema SQL, migrations
```

The web-console is a **React 18 design ported to Next.js 16** (App Router, TypeScript strict). The browser only ever talks to Next.js; Next.js Route Handlers act as a **Backend-for-Frontend (BFF)** that mediates every call to the central-server. Source of truth for the UI is the Claude Design handoff bundle (plain-CSS Carbon-derived tokens + hand-built SVG charts — no component library).

## Central Server

### Generic Resource Pattern
`internal/catalog/catalog.go` is the **only file to edit** when exposing a new table. The store and HTTP API are fully generic — adding a resource entry there is sufficient. No handler code needs changing.

### Adding a New Resource
1. Add the table to PostgreSQL (write a migration in `docs/migrations/`)
2. Add one entry to the `map[string]Resource{}` in `catalog.go`
3. Restart the server — the resource is immediately available

### Authentication
The central-server currently has **no auth middleware** — all endpoints are open, CORS is permissive. Auth AND input validation are enforced one layer up, in the web-console **BFF** (Next.js Route Handlers). The BFF holds the PAT and replays it as `X-API-Key`. Plan for future: add `X-API-Key` validation middleware to the Go server so it isn't reachable un-mediated.

### Pagination Cap
The server enforces `limit ≤ 500` per request. The BFF works around this for dashboards by **paginating server-side** (`lib/api/client.ts → listAll()`), fetching multiple 500-row pages and aggregating before returning. Direct list views still show one page (≤500).

## Web Console

### BFF via Next.js Route Handlers
The browser **never** calls central-server directly (this reverses the earlier "no BFF / direct CORS" decision). Every request goes through Next.js Route Handlers under `app/api/`:
- `auth/route.ts` — login (hash key → match → set cookie), logout, and **session** (`GET` returns the logged-in `SessionUser`)
- `v1/[...path]/route.ts` — **generic proxy** for all 34 resources: injects `X-API-Key`, re-validates write bodies, mirrors upstream status. One handler, matching the central-server's generic catalog design.
- `aggregate/[metric]/route.ts` — server-side rollups (cost-by-day, requests-by-model, latency-percentiles, heat-strip, violations-by-rule) that paginate past the 500-row cap
- `stream/route.ts` — SSE bridge (polls `request-logs` every 5 s)

The upstream URL is a **server-only** env var (`CENTRAL_SERVER_URL`, no `NEXT_PUBLIC_`). `lib/api/client.ts` is imported only by Route Handlers.

### Auth Strategy
- User enters their raw API key on the login screen → `POST /api/auth`.
- The BFF SHA-256-hashes it and matches against `key_hash` via `GET /api/v1/api-keys?limit=500`.
- The raw key is stored **server-side** as an `HttpOnly; SameSite=Strict` cookie (`pat`, 24 h) — it is never exposed to client JS again. The BFF replays it as `X-API-Key` upstream.
- The UI identity (header avatar/name/email) comes from `GET /api/auth` (`lib/session.ts → useSession()`), so it reflects whoever is logged in — never a hardcoded seed user.
- **Limitation**: matching api-keys is O(n) over ≤500 keys; add a server-side lookup for larger deployments.

### Server-Side Aggregations (BFF)
The central-server has no GROUP BY / aggregate endpoints, so the **BFF** computes them in `app/api/aggregate/[metric]/route.ts` using pure helpers in `lib/api/aggregations.ts`, over rows fetched with `listAll()` (multi-page, past the 500 cap). Screens consume them via `useAggregate()`; the design's seed data (`lib/seed.ts`) is the SWR `fallbackData` so the UI never blanks. Enterprise-scale visuals the CRUD API genuinely can't reproduce (provider-share donut, LLM-vs-MCP split, guardrail flow) stay on seed and are flagged in `web-console-implemented.md`.

### `NUMERIC` arrives as strings
PostgreSQL `NUMERIC` columns (cost, amounts, latency, confidence) serialize to JSON **strings**. Always coerce with `Number()` before arithmetic — typed as `number | string` in `lib/types`.

### Hydration: charts are client-only
The hand-built SVG charts use trig and would diverge between server and client float output. Each chart gates its SVG behind a `useMounted()` flag (renders a sized placeholder on the server), so there are no hydration mismatches.

### New Tables (Migration 001)
Three tables were added to support design screens not covered by the original 30-table schema:

| Table | Purpose |
|---|---|
| `rate_limits` | RPM/TPM/RPD/TPD rules per scope (global/org/role/user) |
| `pii_objects` | PII detection rules with masking configuration |
| `skills` | Versioned SKILL.md definitions (frontmatter JSONB + markdown body) |
| `role_skills` | Role ↔ skill access grants (can_invoke, can_edit) |

### Real-Time Updates
The central-server has no native SSE/WebSocket. The web-console simulates real-time via:
1. `app/api/stream/route.ts` — BFF Route Handler polling `request-logs?limit=50` every 5 s, emitting SSE events
2. `lib/sse.ts` — `useSSE()` hook wrapping `EventSource('/api/stream')` with auto-reconnect
3. The Overview `LiveLine` keeps a rolling RPS buffer; heat strips "breathe" via CSS

### No chart/diagram libraries
There is **no JointJS, ECharts, or component library**. All charts (`components/charts/`) are dependency-free hand-built SVG ported from the design; the org-chart (`app/(dashboard)/org`) is a native SVG tree with pan/zoom. The animation technique keeps each chart's resting style at the fully-visible end-state (`animation-fill-mode: forwards`) so a backgrounded tab never freezes a chart blank.

### Org Hierarchy
PostgreSQL's `organizations` table has no `parent_id` column. Org hierarchy is stored in the `settings` JSONB field under key `parent_org_id`. Example:
```json
{ "parent_org_id": "uuid-of-parent-org" }
```
The org-chart component reconstructs the tree client-side from this field.

### Provider Accounts
There is no `providers` table. Provider identity is inferred from the `models.model_id` string prefix:
- `gpt-*` → OpenAI
- `claude-*` → Anthropic
- `gemini-*` → Google
- `mistral-*` → Mistral
- `nova-*` / `titan-*` → AWS Bedrock

This is a heuristic and will miss custom model IDs.

### CRUD + validation
Every gateway object has create/edit/delete with two-layer validation. The reusable `components/common/ResourceCrud.tsx` scaffold renders a live table + add/edit modal + delete for any resource from field definitions; `lib/validation/index.ts` holds per-resource rules used by **both** the client form and the BFF proxy (so a direct API call can't bypass them). Mapping UIs (role→permissions, role→skills matrices) batch POST/DELETE of link rows. Note: some upstream columns are `NOT NULL` without our forms exposing them — the BFF backfills sensible defaults (e.g. `users.external_id` ← email).

## Known Issues / Limitations

1. **500-row cap on list views** — table screens show one page; dashboards beat it via BFF `listAll()` pagination
2. **No server auth** — central-server endpoints are open; the BFF is the only enforcement point (auth + validation). Anyone who can reach `:10000` directly bypasses it
3. **Org hierarchy via JSONB** — `organizations.settings.parent_org_id`; not FK-enforced; orphan prevention is application-level
4. **Provider inference** — prefix-based detection (`gpt-*`→OpenAI, `claude-*`→Anthropic, …) misses custom model IDs; no `providers` table exists
5. **Entra ID / Active Directory** — login + auth-config panels are UI stubs; no OAuth/LDAP flow
6. **Configuration screen** — persisted to `organizations.settings` JSONB but not enforced by the gateway engine
7. **Guardrail flow diagram** — static hand-built SVG/Sankey, not interactive
8. **Dimensional Viewer / Model Metrics** — analytical rollups the CRUD API can't supply use seed data (flagged in `web-console-implemented.md`)
