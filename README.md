# Pangreksa AI Gateway

Multi-tenant AI gateway management platform. Provides a central API server and a web-based management console for governing AI model access, budgets, guardrails, prompt registries, MCP integrations, and observability.

## Architecture

```
Browser ──(same-origin /api/*, HttpOnly pat cookie)──┐
                                                      ▼
                       web-console  (Next.js 16 App Router + BFF, port 3000)
                          • Route Handlers proxy + aggregate + bridge SSE
                          • injects X-API-Key, validates writes
                                                      ▼
                       central-server  (Go REST, port 10000)
                                                      ▼
                       PostgreSQL 16  (localhost:5432, db: aigateway1)
```

The browser only ever talks to Next.js. The web-console's Route Handlers form a **Backend-for-Frontend (BFF)** that holds the auth token, proxies all resource calls, validates writes, runs server-side aggregation (beating the 500-row cap), and bridges SSE. The UI is a React design ported to Next.js with plain-CSS Carbon-derived tokens and hand-built SVG charts (no component/chart library).

## Prerequisites

| Tool | Minimum Version |
|---|---|
| Go | 1.22 |
| Node.js | 22 LTS (built/tested on 24) |
| PostgreSQL | 16 |

## Quick Start

### 1. Run Database Migration

```bash
psql -h localhost -U gateway_user -d aigateway1 \
  -f docs/migrations/001_add_rate_limits_pii_skills.sql
```

### 2. Start Central Server

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

### 3. Start Web Console

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
├── central-server/          Go REST API — 34 generic CRUD resources
│   ├── cmd/server/          Entry point
│   └── internal/
│       ├── catalog/         Resource ↔ table whitelist (edit here to expose new tables)
│       ├── httpapi/         HTTP routing + middleware
│       ├── store/           Generic DB CRUD
│       └── ...
├── docs/
│   ├── api-docs.md          REST API reference
│   ├── db-docs.md           Schema documentation
│   ├── ai_gateway_schema.sql
│   ├── ai_gateway_sample_data_02.sql
│   └── migrations/          Incremental SQL migrations
│       └── 001_add_rate_limits_pii_skills.sql
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

See [docs/api-docs.md](docs/api-docs.md) for full reference.

## Development

Run central-server tests:

```bash
cd central-server && go test ./...
```

Type-check and build web-console:

```bash
cd web-console
npx tsc --noEmit     # strict type-check
npm run build        # production build (24 routes)
```

### Starting both servers

`.claude/launch.json` defines both processes (`central-server` on a fixed `:10000`, `web-console` on `:3000`). The web-console BFF reads `CENTRAL_SERVER_URL` (server-only) to reach the central-server.
