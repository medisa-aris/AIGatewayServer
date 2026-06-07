# AI Gateway Central Server

Go REST API for the AI Gateway PostgreSQL schema. The service listens on port `10000` by default and connects to PostgreSQL 16 using the database settings provided for `aigateway1`.

## Run

```powershell
cd central-server
go run ./cmd/server
```

## Test

```powershell
cd central-server
go test ./...
```

## Configuration

Configuration is read from environment variables. Defaults are set for the development database:

| Variable | Default |
| --- | --- |
| `AI_GATEWAY_HTTP_HOST` | `0.0.0.0` |
| `AI_GATEWAY_HTTP_PORT` | `10000` |
| `AI_GATEWAY_DB_HOST` | `localhost` |
| `AI_GATEWAY_DB_PORT` | `5432` |
| `AI_GATEWAY_DB_USER` | `gateway_user` |
| `AI_GATEWAY_DB_PASSWORD` | `change-me-in-production` |
| `AI_GATEWAY_DB_NAME` | `aigateway1` |
| `AI_GATEWAY_DB_SSLMODE` | `disable` |

## Endpoints

- `GET /healthz`
- `GET /readyz`
- `GET /api/v1/resources`
- `GET /api/v1/{resource}?limit=100&offset=0&org_id={uuid}`
- `GET /api/v1/{resource}/{id}`
- `POST /api/v1/{resource}`
- `PATCH /api/v1/{resource}/{id}`
- `DELETE /api/v1/{resource}/{id}`

Resource names use kebab case, for example `organizations`, `users`, `models`, `virtual-models`, `prompt-registries`, `mcp-servers`, and `request-logs`.
