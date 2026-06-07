# Web Console — Implementation Tracker

Status of every screen and capability in `web-console/` (Next.js 16 + BFF).
Legend: ✅ done · ⚠️ done with documented limitation · ❌ not implemented.

Data source key: **Live** = real central-server data via the BFF · **Agg** = BFF server-side aggregate · **Seed** = design seed data (`lib/seed.ts`) where the CRUD API has no equivalent.

## Foundation

| Item | Status | Notes |
|---|---|---|
| Next.js 16 App Router + TS strict | ✅ | `noUncheckedIndexedAccess` on |
| Design tokens (light/dark/accent/density) | ✅ | `app/globals.css` ported verbatim |
| Icon set | ✅ | `components/Icon.tsx` |
| UI primitives | ✅ | `components/ui/` (Btn, Tag, Modal, DataTable, …) |
| SVG chart library | ✅ | Line/Bar/Donut/Sparkline/HeatStrip/LiveLine/Sankey — no library |
| Theme + Tweaks | ✅ | `lib/theme.tsx`, floating Tweaks panel |
| App shell (header, side nav, ⌘K palette, toasts) | ✅ | `components/shell/` |
| Session identity in header | ✅ | `lib/session.ts` — shows the logged-in user |

## BFF (`app/api/`)

| Endpoint | Status | Notes |
|---|---|---|
| `auth` (login/logout/session) | ✅ | PAT hashed + matched; `pat` HttpOnly cookie; `GET` returns `SessionUser` |
| `v1/[...path]` generic proxy | ✅ | All 34 resources; injects `X-API-Key`; re-validates writes |
| `aggregate/[metric]` | ✅ | cost-by-day, requests-by-model, latency-percentiles, heat-strip, violations-by-rule (paginates past 500 cap) |
| `stream` (SSE) | ✅ | polls `request-logs` every 5 s |

## Screens

| Screen | Route | Status | Data | Notes |
|---|---|---|---|---|
| Login | `/login` | ✅ | Live | Real PAT auth; Entra/AD buttons are stubs |
| Overview | `/overview` | ✅ | Agg + Seed | KPIs/cost/heat/top-models live via aggregate; provider-share, calls-split, guardrail summary seeded |
| Model Metrics | `/model-metrics` | ⚠️ | Seed | Per-model reqs/cost/percentiles not in CRUD API |
| Guardrails Activity | `/guardrail-activity` | ⚠️ | Agg + Seed | Triggers-by-rule live; Sankey flow + trends seeded |
| Request Logs | `/logs` | ✅ | Live | Maps `request-logs`; filter/expand/paginate; live tail |
| Dimensional Viewer | `/dimensional` | ⚠️ | Seed | Person/Model/MCP/Org tabs; cross-cut rollups seeded |
| Virtual Models | `/virtual-models` | ✅ | Live | Full CRUD |
| Provider Accounts | `/providers` | ⚠️ | Live | Inferred from `models.model_id` prefix; no `providers` table; read-only |
| Prompt Registry | `/prompts` | ✅ | Live | CRUD over `prompt-registries` |
| MCP Servers | `/mcp` | ✅ | Live | CRUD over `mcp-servers` |
| Skills | `/skills` | ✅ | Live | CRUD over `skills` |
| Guardrails | `/guardrails` | ✅ | Live | Hook-flow diagram + CRUD over `guardrail-profiles` |
| PII Protection | `/pii` | ✅ | Live | CRUD; conditional pattern/replacement fields |
| Budgets | `/budgets` | ✅ | Live | CRUD + usage bars |
| Rate Limits | `/rate-limits` | ✅ | Live | CRUD over `rate-limits` |
| Users & Roles | `/users` | ✅ | Live | Users (Create + Invite), Roles, RBAC matrix |
| Organization | `/org` | ✅ | Live | Native SVG org-chart over `organizations`; CRUD; hierarchy via `settings.parent_org_id` |
| Authentication | `/auth` | ⚠️ | Seed | UI-only provider config; no OAuth/LDAP backend |
| API Tokens | `/tokens` | ✅ | Live | Generate (raw shown once) → SHA-256 hash stored; revoke |
| Configuration | `/config` | ⚠️ | Live | Persisted to `organizations.settings` JSONB; not enforced by engine |

## CRUD + validation coverage

Full create / edit / delete with two-layer validation (client form + BFF proxy):

| Resource | C | R | U | D | Notes |
|---|---|---|---|---|---|
| organizations | ✅ | ✅ | ✅ | ✅ | slug/email/parent-cycle checks |
| users | ✅ | ✅ | ✅ | ◐ | delete = deactivate; **Create user** (full form) + **Invite user**; BFF backfills `external_id` |
| roles | ✅ | ✅ | ✅ | ✅ | |
| role-permissions | ✅ | ✅ | — | ✅ | RBAC matrix (batched POST/DELETE) |
| api-keys | ✅ | ✅ | — | ✅ | create=generate-once; delete=revoke |
| models | ✅ | ✅ | ✅ | ✅ | via generic proxy + validation |
| virtual-models | ✅ | ✅ | ✅ | ✅ | |
| guardrail-profiles | ✅ | ✅ | ✅ | ✅ | |
| pii-objects | ✅ | ✅ | ✅ | ✅ | regex/replacement conditional validation |
| prompt-registries | ✅ | ✅ | ✅ | ✅ | |
| budgets | ✅ | ✅ | ✅ | ✅ | total_amount > 0, period order |
| rate-limits | ✅ | ✅ | ✅ | ✅ | scope/limit-type/value validation |
| mcp-servers | ✅ | ✅ | ✅ | ✅ | URL + transport validation |
| skills | ✅ | ✅ | ✅ | ✅ | semver + status validation |

Secondary link tables (role-models, role-mcps, role-budgets, role-guardrails, role-virtual-models, role-prompt-registries, role-skills, prompt-versions, mcp-tools, …) are reachable through the same generic proxy + `ResourceCrud` pattern.

## Known limitations

1. **500-row cap** on plain list views; dashboards beat it via BFF `listAll()` pagination.
2. **No central-server auth** — the BFF is the only enforcement point (auth + validation).
3. **Org hierarchy** via `settings.parent_org_id` JSONB — not FK-enforced.
4. **Provider inference** is prefix-based; misses custom model IDs.
5. **Entra ID / Active Directory** login and config are UI stubs.
6. **Configuration** stored in JSONB but not enforced by the engine.
7. **Dimensional Viewer / Model Metrics** analytical rollups use seed data.

## Verification

- `npx tsc --noEmit` — passes.
- `npm run build` — succeeds (24 routes).
- Login with a real key → header shows the logged-in user.
- CRUD round-trip (e.g. create user, rate limit) persists and refreshes.
- Validation: invalid email / out-of-range values blocked client-side **and** by the BFF (`400 {error, field}`).
