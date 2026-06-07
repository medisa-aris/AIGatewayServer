# Pangreksa AI Gateway

Multi-tenant AI gateway management platform. Provides a central API server and a web-based management console for governing AI model access, budgets, guardrails, prompt registries, MCP integrations, proxy routing, and observability.

## Architecture

```
Browser ──(same-origin /api/*, HttpOnly pat cookie)──┐
                                                      ▼
                       web-console  (Next.js 16 App Router + BFF, port 3000)
                          • Route Handlers proxy + aggregate + bridge SSE
                          • injects X-API-Key, validates writes
                                                      ▼
                       central-server  (Go REST, port 10000)
                          • 47 generic CRUD resources
                          • Proxy Engine (configurable ports, per-endpoint listeners)
                          • Routing/Guardrail Pipeline (dry-run + live execution)
                                                      ▼
                       PostgreSQL 16  (localhost:5432, db: aigateway1)

AI Clients ──(OpenAI / Anthropic / Ollama dialect)──▶ Proxy Engine (dynamic ports)
                                                      ▼
                       Routing Pipeline: identity → endpoint → MCP → skill →
                                         PII → budget → rate → upstream provider
```

The browser only ever talks to Next.js. The web-console's Route Handlers form a **Backend-for-Frontend (BFF)** that holds the auth token, proxies all resource calls, validates writes, runs server-side aggregation (beating the 500-row cap), and bridges SSE. The Proxy Engine runs independently on configurable ports and routes live AI requests through the guardrail pipeline.

## Prerequisites

| Tool | Minimum Version |
|---|---|
| Go | 1.22 |
| Node.js | 22 LTS (built/tested on 24) |
| PostgreSQL | 16 |

## Quick Start

### 1. Run Database Migrations

Apply all migrations in order:

```bash
# Using the migration CLI (recommended)
cd central-server
go run ./cmd/migrate \
  ../docs/migrations/001_add_rate_limits_pii_skills.sql \
  ../docs/migrations/002_add_provider_accounts.sql \
  ../docs/migrations/003_add_proxy.sql \
  ../docs/migrations/004_virtual_models_routing.sql \
  ../docs/migrations/005_proxy_endpoint_virtual_model.sql \
  ../docs/migrations/006_add_pii_objects.sql \
  ../docs/migrations/007_seed_rate_limits.sql \
  ../docs/migrations/008_guardrail_profiles_links.sql \
  ../docs/migrations/009_drop_guardrail_profile_type.sql \
  ../docs/migrations/010_seed_budgets.sql \
  ../docs/migrations/011_seed_more_users.sql \
  ../docs/migrations/012_rbac_open_constraints.sql \
  ../docs/migrations/013_proxy_services.sql \
  ../docs/migrations/014_route_logs.sql
```

Or apply individually with `psql`:

```bash
psql -h localhost -U gateway_user -d aigateway1 -f docs/migrations/<file>.sql
```

The migration CLI uses the same `AI_GATEWAY_DB_*` environment variables as the main server.

### 2. Start Central Server

**Windows (PowerShell):**

```powershell
.\start\server.ps1
```

**Manual:**

```bash
cd central-server
go run ./cmd/server
# Listening on :10000
```

Environment variables (all optional, defaults shown):

| Variable | Default | Description |
|---|---|---|
| `AI_GATEWAY_HTTP_HOST` | `0.0.0.0` | Bind address |
| `AI_GATEWAY_HTTP_PORT` | `10000` | HTTP port |
| `AI_GATEWAY_DB_HOST` | `localhost` | PostgreSQL host |
| `AI_GATEWAY_DB_PORT` | `5432` | PostgreSQL port |
| `AI_GATEWAY_DB_USER` | `gateway_user` | DB user |
| `AI_GATEWAY_DB_PASSWORD` | — | DB password |
| `AI_GATEWAY_DB_NAME` | `aigateway1` | DB name |
| `AI_GATEWAY_DB_SSLMODE` | `disable` | SSL mode |

### 3. Start Web Console

**Windows (PowerShell):**

```powershell
.\start\web.ps1
```

**Manual:**

```bash
cd web-console
cp .env.local.example .env.local   # sets CENTRAL_SERVER_URL=http://localhost:10000 (server-only)
npm install
npm run dev
# Open http://localhost:3000
```

Log in on the **API key** path with a raw key whose SHA-256 matches an active `api_keys.key_hash`. The BFF hashes the input and matches it server-side, then stores the raw key as an `HttpOnly` cookie and replays it upstream as `X-API-Key` — the browser never calls central-server directly.

> **Need a usable key?** Create one in **Administration → API Tokens** (the raw key is shown **once** at creation — only its hash is stored, so save it then). If you lose it, create a new token; raw keys cannot be recovered.

## Repository Layout

```
.
├── central-server/          Go REST API — 47 generic CRUD resources
│   ├── cmd/
│   │   ├── server/          Entry point (HTTP server + Proxy Engine)
│   │   └── migrate/         CLI to apply SQL migration files
│   └── internal/
│       ├── catalog/         Resource ↔ table whitelist (edit here to expose new tables)
│       ├── httpapi/         HTTP routing + middleware
│       ├── store/           Generic DB CRUD
│       ├── proxy/           Proxy Engine — dynamic per-port listeners (Manager + handlers)
│       └── routing/         Routing/Guardrail Pipeline — dry-run (Service) + live (Executor)
├── docs/
│   ├── api-docs.md          REST API reference
│   ├── db-docs.md           Schema documentation
│   ├── ai_gateway_schema.sql
│   ├── ai_gateway_sample_data_02.sql
│   └── migrations/          Incremental SQL migrations (001–014)
├── start/
│   ├── server.ps1           Windows: build + start central-server
│   └── web.ps1              Windows: install deps + start web-console
├── web-console/             Next.js management UI
│   └── README.md            Web-console setup guide
├── CLAUDE.md                Architecture decisions for AI-assisted development
└── web-console-implemented.md  Feature implementation tracker
```

## API Overview

Base URL: `http://localhost:10000`

All resources share the same CRUD pattern:

```
GET    /api/v1/{resource}?limit=100&offset=0&org_id={uuid}
GET    /api/v1/{resource}/{id}
POST   /api/v1/{resource}
PATCH  /api/v1/{resource}/{id}
DELETE /api/v1/{resource}/{id}
```

Special endpoints:

```
POST   /api/v1/route-request/test    Dry-run guardrail check (returns pipeline trace)
POST   /api/v1/route-request         Live request execution through routing pipeline
```

See [docs/api-docs.md](docs/api-docs.md) for full reference.

## Proxy Engine

The gateway runs a built-in HTTP proxy on configurable ports. Configure it under **Proxy Services** in the web console:

1. **Proxy Settings** — enable/disable the engine and set the bind address (default `127.0.0.1`).
2. **Proxy Endpoints** — each active endpoint binds its own port and exposes an inference API in one of four dialects:

| Dialect | Route |
|---|---|
| `openai` (default) | `POST /v1/chat/completions` |
| `anthropic` | `POST /v1/messages` |
| `ollama` | `POST /api/chat` |
| `azure` | `POST /openai/deployments/{deployment}/chat/completions` |

Every request is authenticated with the caller's API key (Bearer token or `x-api-key` header), then routed through the full guardrail pipeline. Results are logged to `route_logs`.

## Routing / Guardrail Pipeline

The pipeline runs the same stages for both dry-run tests and live requests:

1. **resolve_user** — hash the API key, look up active user + org
2. **endpoint_access** — verify the user's role grants access to the target proxy endpoint
3. **mcp_access** — check MCP server access (if supplied)
4. **skill_check** — detect skill references in the message, verify access
5. **pii_scan** — scan for PII patterns; non-blocking (returns `warn`, masks on live execution)
6. **budget_check** — verify the user has remaining budget
7. **rate_check** — verify RPM/TPM/RPD/TPD limits

The dry-run endpoint (`POST /api/v1/route-request/test`) accepts an `api_key_id` UUID so the Testing modal can test without the raw key. Live execution routes through the provider account's upstream.

## Development

Run central-server tests:

```bash
cd central-server && go test ./...
```

Type-check and build web-console:

```bash
cd web-console
npx tsc --noEmit     # strict type-check
npm run build        # production build
```

Apply a single migration:

```bash
cd central-server
go run ./cmd/migrate ../docs/migrations/014_route_logs.sql
```
