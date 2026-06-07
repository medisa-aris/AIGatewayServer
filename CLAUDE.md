# CLAUDE.md — Architecture Guidance

This file documents architectural decisions, known constraints, and guidance for AI-assisted development on this project.

## Project Structure

```
central-server/   Go REST API (port 10000)
web-console/      Next.js 16 (App Router) management UI + BFF (port 3000)
docs/             API docs, DB docs, schema SQL, migrations
start/            Windows PowerShell convenience scripts
```

The web-console is a **React 18 design ported to Next.js 16** (App Router, TypeScript strict). The browser only ever talks to Next.js; Next.js Route Handlers act as a **Backend-for-Frontend (BFF)** that mediates every call to the central-server. Source of truth for the UI is the Claude Design handoff bundle (plain-CSS Carbon-derived tokens + hand-built SVG charts — no component library).

## Central Server

### Generic Resource Pattern
`internal/catalog/catalog.go` is the **only file to edit** when exposing a new table. The store and HTTP API are fully generic — adding a resource entry there is sufficient. No handler code needs changing.

The catalog currently exposes **47 resources** (up from the original 34). Key additions grouped by migration:

- **Migration 001** — `rate_limits`, `pii_objects`, `skills`, `role_skills`
- **Migration 002** — `provider_accounts`
- **Migration 003** — `proxy_settings`, `proxy_endpoints`
- **Migration 013** — `user_proxy_endpoints`, `user_mcp_servers`, `user_skills`, `user_guardrails`, `org_proxy_endpoints`, `org_mcp_servers`, `org_skills`, `org_guardrails`
- **Migration 014** — `route_logs`

### Adding a New Resource
1. Add the table to PostgreSQL (write a migration in `docs/migrations/`)
2. Add one entry to the `map[string]Resource{}` in `catalog.go`
3. Restart the server — the resource is immediately available

### Migration CLI
`cmd/migrate/main.go` is a standalone tool for applying SQL migration files. It uses the same `AI_GATEWAY_DB_*` env vars as the main server.

```bash
go run ./cmd/migrate docs/migrations/014_route_logs.sql
```

### Authentication
The central-server currently has **no auth middleware** — all endpoints are open, CORS is permissive. Auth AND input validation are enforced one layer up, in the web-console **BFF** (Next.js Route Handlers). The BFF holds the PAT and replays it as `X-API-Key`. Plan for future: add `X-API-Key` validation middleware to the Go server so it isn't reachable un-mediated.

### Pagination Cap
The server enforces `limit ≤ 500` per request. The BFF works around this for dashboards by **paginating server-side** (`lib/api/client.ts → listAll()`), fetching multiple 500-row pages and aggregating before returning. Direct list views still show one page (≤500).

## Proxy Engine

`internal/proxy/` implements a dynamic multi-port HTTP proxy that forwards AI requests through the routing pipeline.

### Manager (`proxy/manager.go`)
Polls `proxy_settings` and `proxy_endpoints` every 3 seconds and reconciles running HTTP listeners to match the desired database state:
- `is_enabled = false` → stop all listeners
- Active endpoint with port N → start a listener on `<bind_address>:N`
- Endpoint removed / deactivated → graceful shutdown of that port's listener

`Manager.Reload()` signals an immediate reconcile (non-blocking) — call it after a write to `proxy_settings` or `proxy_endpoints`.

### Handler (`proxy/handler.go`)
Each listener serves one dialect. Dialect is set per `proxy_endpoints.dialect`:

| Dialect | Route | Auth Header |
|---|---|---|
| `openai` (default) | `POST /v1/chat/completions` | `Authorization: Bearer <key>` |
| `anthropic` | `POST /v1/messages` | `x-api-key` or `Authorization: Bearer` |
| `ollama` | `POST /api/chat` | `Authorization: Bearer <key>` |
| `azure` | `POST /openai/deployments/{deployment}/chat/completions` | `Authorization: Bearer <key>` |

Every handler extracts the last user message, resolves the API key, calls `routing.Executor.Execute()`, and maps the result to the dialect's response shape.

## Routing / Guardrail Pipeline

`internal/routing/` contains both the dry-run validator (`Service`) and the live executor (`Executor`).

### Service — dry-run (`routing/service.go`)
`RouteRequestTest` runs the full 7-step pipeline without mutating any data and without calling an upstream provider. Returns a `RouteRequestTestReport` with an ordered `[]CheckResult` slice designed to render directly as a step-by-step trace in the web-console Testing modal.

Pipeline steps (all run even after a failure, so the trace is always complete):

| Step | Status on failure |
|---|---|
| `resolve_user` | `fail` — pipeline returns `ErrInvalidAPIKey` |
| `endpoint_access` | `fail` — flips `Allowed = false` |
| `mcp_access` | `fail` or `skip` (if no MCPServerID supplied) |
| `skill_check` | `fail` if skill referenced but not permitted |
| `pii_scan` | `warn` — non-blocking, lists detected PII types |
| `budget_check` | `fail` if remaining budget ≤ 0 |
| `rate_check` | `warn` if rate limits would be exceeded |

Identity resolution: accepts either a raw `APIKey` (SHA-256 hashed before lookup) or an `APIKeyID` UUID (used by the Testing modal which cannot access raw keys).

### Executor — live execution (`routing/executor.go`)
`Execute` runs the same pipeline then forwards to the upstream provider account. On completion it writes a row to `route_logs` with the full pipeline trace, token counts, cost, latency, and provider response.

### DataSource / DataWriter interfaces
Both `Service` and `Executor` depend on thin interfaces (`DataSource`, `DataWriter`) satisfied by `*store.Store`. This keeps the routing package decoupled and trivially testable with in-memory stubs.

### Route Logs
`route_logs` records every live execution. Key columns:
- `message_inquiry` — original user message before skill/MCP augmentation
- `message_request` — augmented message sent to the upstream provider
- `message_output` — raw provider response
- `pipeline_checks` — `[]CheckResult` JSONB array (same shape as the dry-run trace)
- `guardrail_violation_ids` — JSONB array of triggered `guardrail_violations.id` UUIDs
- `status` — `allowed` | `blocked` | `error`

The web-console **Route Logs** screen (`app/(dashboard)/route-logs/`) reads this table directly via the BFF generic proxy.

## Web Console

### BFF via Next.js Route Handlers
The browser **never** calls central-server directly (this reverses the earlier "no BFF / direct CORS" decision). Every request goes through Next.js Route Handlers under `app/api/`:
- `auth/route.ts` — login (hash key → match → set cookie), logout, and **session** (`GET` returns the logged-in `SessionUser`)
- `v1/[...path]/route.ts` — **generic proxy** for all 47 resources: injects `X-API-Key`, re-validates write bodies, mirrors upstream status. One handler, matching the central-server's generic catalog design.
- `aggregate/[metric]/route.ts` — server-side rollups (cost-by-day, requests-by-model, latency-percentiles, heat-strip, violations-by-rule) that paginate past the 500-row cap
- `stream/route.ts` — SSE bridge (polls `request-logs` every 5 s)
- `route-request/route.ts` — proxies dry-run (`POST …/test`) and live route execution to the central-server routing endpoints
- `providers/[id]/test-model/route.ts` — tests a provider account's upstream connectivity
- `proxy-test/route.ts` — tests a proxy endpoint configuration

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

### Schema Additions by Migration

| Migration | Tables added |
|---|---|
| 001 | `rate_limits`, `pii_objects`, `skills`, `role_skills` |
| 002 | `provider_accounts` |
| 003 | `proxy_settings`, `proxy_endpoints` |
| 004 | virtual model routing columns |
| 005 | `proxy_endpoints.virtual_model_id` FK |
| 006 | `pii_objects` (re-seeded / extended) |
| 007 | seed data for `rate_limits` |
| 008 | guardrail profile link tables |
| 009 | drops `guardrail_profiles.profile_type` column |
| 010 | seed data for `budgets` |
| 011 | seed data for `users` |
| 012 | RBAC constraint relaxations |
| 013 | `user_proxy_endpoints`, `user_mcp_servers`, `user_skills`, `user_guardrails`, `org_proxy_endpoints`, `org_mcp_servers`, `org_skills`, `org_guardrails` |
| 014 | `route_logs` |

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
Provider accounts are stored in the `provider_accounts` table (added by migration 002). Fields include `provider_type`, `api_key`, `endpoint_url`, `region`, and `extra_config`. The Proxy Engine's `Executor` resolves the provider account from a proxy endpoint's `provider_account_id` FK to select the upstream target.

Provider identity for the legacy `models` table is still inferred from `models.model_id` string prefix (no FK):
- `gpt-*` → OpenAI
- `claude-*` → Anthropic
- `gemini-*` → Google
- `mistral-*` → Mistral
- `nova-*` / `titan-*` → AWS Bedrock

### CRUD + validation
Every gateway object has create/edit/delete with two-layer validation. The reusable `components/common/ResourceCrud.tsx` scaffold renders a live table + add/edit modal + delete for any resource from field definitions; `lib/validation/index.ts` holds per-resource rules used by **both** the client form and the BFF proxy (so a direct API call can't bypass them). Mapping UIs (role→permissions, role→skills matrices) batch POST/DELETE of link rows. Note: some upstream columns are `NOT NULL` without our forms exposing them — the BFF backfills sensible defaults (e.g. `users.external_id` ← email).

### Proxy Services UI
`app/(dashboard)/proxy-services/` manages `proxy_settings`, `proxy_endpoints`, and the direct user/org assignment junction tables (migration 013). It also hosts the **Testing modal** which calls `POST /api/route-request/test` to run a dry-run pipeline trace, displaying each `CheckResult` step as a coloured badge (pass=green, fail=red, warn=amber, skip=grey).

### Route Logs UI
`app/(dashboard)/route-logs/` displays `route_logs` rows with a JSON-expandable `pipeline_checks` column showing the guardrail trace for each live request.

## Windows Start Scripts

`start/server.ps1` — builds `central-server.exe` and starts it with the DB env vars pre-set (host: `ai.database`, user: `pangreksa`). Edit to match your local DB.

`start/web.ps1` — installs npm deps if missing and starts `npm run dev`. No `.env.local` required if central-server is on `localhost:10000` (the client hardcodes that default).

## Known Issues / Limitations

1. **500-row cap on list views** — table screens show one page; dashboards beat it via BFF `listAll()` pagination
2. **No server auth** — central-server endpoints are open; the BFF is the only enforcement point (auth + validation). Anyone who can reach `:10000` directly bypasses it
3. **Org hierarchy via JSONB** — `organizations.settings.parent_org_id`; not FK-enforced; orphan prevention is application-level
4. **Provider inference (models table)** — prefix-based detection (`gpt-*`→OpenAI, `claude-*`→Anthropic, …) misses custom model IDs; the `models` table has no FK to `provider_accounts`
5. **Entra ID / Active Directory** — login + auth-config panels are UI stubs; no OAuth/LDAP flow
6. **Configuration screen** — persisted to `organizations.settings` JSONB but not enforced by the gateway engine
7. **Guardrail flow diagram** — static hand-built SVG/Sankey, not interactive
8. **Dimensional Viewer / Model Metrics** — analytical rollups the CRUD API can't supply use seed data (flagged in `web-console-implemented.md`)
9. **Proxy Engine upstream** — `Executor` currently stubs the upstream call; real provider forwarding (HTTP to provider account endpoint) is a pending implementation
