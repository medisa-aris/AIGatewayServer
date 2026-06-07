# AI Gateway Central Server API Docs

Base URL:

```text
http://localhost:10000
```

Default content type:

```text
application/json
```

## Status APIs

### Health Check

Checks whether the HTTP process is alive.

```http
GET /healthz
```

Response `200 OK`:

```json
{
  "status": "ok"
}
```

### Readiness Check

Checks whether the service can reach PostgreSQL.

```http
GET /readyz
```

Response `200 OK`:

```json
{
  "status": "ready"
}
```

Response `503 Service Unavailable`:

```json
{
  "error": "database is not ready"
}
```

## Resource Index

Lists every API resource exposed by the server.

```http
GET /api/v1/resources
```

Response `200 OK`:

```json
{
  "resources": [
    "api-keys",
    "budget-consumptions",
    "budgets",
    "guardrail-profiles",
    "guardrail-violations",
    "mcp-capabilities",
    "mcp-servers",
    "mcp-tools",
    "model-versions",
    "models",
    "organizations",
    "pii-objects",
    "pricing-tiers",
    "prompt-deployments",
    "prompt-registries",
    "prompt-versions",
    "rate-limits",
    "request-logs",
    "role-budgets",
    "role-guardrails",
    "role-mcps",
    "role-models",
    "role-permissions",
    "role-prompt-registries",
    "role-skills",
    "role-virtual-models",
    "roles",
    "sessions",
    "skills",
    "user-budgets",
    "user-roles",
    "users",
    "virtual-model-rules",
    "virtual-models"
  ]
}
```

> Resources `pii-objects`, `rate-limits`, `role-skills`, and `skills` require migration `001_add_rate_limits_pii_skills.sql` to be applied before use.

## Generic Resource APIs

All resources use the same CRUD route format.

### List Items

```http
GET /api/v1/{resource}?limit=100&offset=0&org_id={uuid}
```

Query parameters:

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `limit` | integer | no | Number of rows to return. Defaults to `100`, minimum `1`, maximum `500`. |
| `offset` | integer | no | Number of rows to skip. Defaults to `0`. |
| `org_id` | UUID | no | Filters resources that have an `org_id` column. Ignored by resources without `org_id`. |

Response `200 OK`:

```json
{
  "data": [
    {
      "id": "a1111111-1111-1111-1111-111111111111",
      "name": "Acme Corp"
    }
  ],
  "limit": 100,
  "offset": 0
}
```

### Get Item

```http
GET /api/v1/{resource}/{id}
```

Response `200 OK`:

```json
{
  "data": {
    "id": "a1111111-1111-1111-1111-111111111111",
    "name": "Acme Corp"
  }
}
```

Response `404 Not Found`:

```json
{
  "error": "resource item was not found"
}
```

### Create Item

```http
POST /api/v1/{resource}
```

Request body:

```json
{
  "column_name": "value",
  "jsonb_column": {
    "key": "value"
  }
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "generated-or-provided-uuid",
    "column_name": "value"
  }
}
```

### Update Item

```http
PATCH /api/v1/{resource}/{id}
```

Request body:

```json
{
  "column_name": "new value"
}
```

Response `200 OK`:

```json
{
  "data": {
    "id": "existing-uuid",
    "column_name": "new value"
  }
}
```

### Delete Item

```http
DELETE /api/v1/{resource}/{id}
```

Response `204 No Content`.

## Common Error Responses

Unknown resource:

```json
{
  "error": "resource is not available"
}
```

Invalid route:

```json
{
  "error": "route is not available"
}
```

Invalid JSON body:

```json
{
  "error": "request body must be a JSON object"
}
```

Payload has no writable columns:

```json
{
  "error": "payload has no writable columns"
}
```

Storage failure:

```json
{
  "error": "store operation failed"
}
```

## Resource Fields

Use the listed resource name in `{resource}`. Request bodies for `POST` and `PATCH` should use these column names. Database defaults may fill omitted columns.

| Resource | Table | Fields |
| --- | --- | --- |
| `api-keys` | `api_keys` | `id`, `user_id`, `org_id`, `key_hash`, `name`, `scope`, `created_at`, `expires_at`, `last_used_at`, `is_active`, `permissions` |
| `budget-consumptions` | `budget_consumptions` | `id`, `user_budget_id`, `user_id`, `request_id`, `amount`, `currency`, `usage_type`, `quantity`, `consumed_at`, `status` |
| `budgets` | `budgets` | `id`, `org_id`, `name`, `total_amount`, `remaining_amount`, `currency`, `period`, `period_start`, `period_end`, `is_active`, `is_shared` |
| `guardrail-profiles` | `guardrail_profiles` | `id`, `org_id`, `name`, `description`, `is_default`, `content_policy`, `pii_rules`, `topic_filters`, `rate_limits`, `custom_rules`, `is_active`, `created_at` |
| `guardrail-violations` | `guardrail_violations` | `id`, `request_id`, `guardrail_profile_id`, `rule_type`, `severity`, `triggered_content_snippet`, `action_taken`, `triggered_at`, `metadata` |
| `mcp-capabilities` | `mcp_capabilities` | `id`, `mcp_server_id`, `capability_type`, `config` |
| `mcp-servers` | `mcp_servers` | `id`, `org_id`, `name`, `slug`, `transport`, `endpoint_url`, `auth_config`, `status`, `is_active`, `created_at` |
| `mcp-tools` | `mcp_tools` | `id`, `mcp_server_id`, `name`, `description`, `input_schema`, `is_active` |
| `model-versions` | `model_versions` | `id`, `model_id`, `version`, `deployment_status`, `config`, `released_at` |
| `models` | `models` | `id`, `org_id`, `provider_id`, `model_id`, `name`, `modality`, `capabilities`, `max_tokens`, `is_active`, `created_at` |
| `organizations` | `organizations` | `id`, `name`, `slug`, `tier`, `created_at`, `updated_at`, `is_active`, `settings`, `billing_email` |
| `pii-objects` | `pii_objects` | `id`, `org_id`, `name`, `description`, `detection_method`, `pattern`, `masking_style`, `replacement_text`, `min_confidence`, `is_active`, `created_at` |
| `pricing-tiers` | `pricing_tiers` | `id`, `model_id`, `tier_name`, `input_price`, `output_price`, `cached_price`, `currency`, `effective_from`, `effective_to` |
| `prompt-deployments` | `prompt_deployments` | `id`, `version_id`, `deployed_by`, `endpoint_alias`, `runtime_config`, `is_active`, `deployed_at` |
| `prompt-registries` | `prompt_registries` | `id`, `org_id`, `name`, `slug`, `description`, `visibility`, `category`, `tags`, `is_active`, `created_at` |
| `prompt-versions` | `prompt_versions` | `id`, `registry_id`, `author_id`, `version_number`, `prompt_template`, `variables`, `metadata`, `status`, `created_at` |
| `rate-limits` | `rate_limits` | `id`, `org_id`, `name`, `scope`, `scope_id`, `limit_type`, `limit_value`, `window_seconds`, `is_active`, `priority`, `created_at`, `updated_at` |
| `request-logs` | `request_logs` | `id`, `request_id`, `user_id`, `api_key_id`, `model_id`, `virtual_model_id`, `prompt_registry_id`, `mcp_server_id`, `guardrail_profile_id`, `matched_rule_id`, `started_at`, `completed_at`, `method`, `path`, `status_code`, `input_tokens`, `output_tokens`, `cached_tokens`, `cost`, `latency_ms`, `request_headers`, `response_headers`, `error_message`, `trace_id`, `region` |
| `role-budgets` | `role_budgets` | `id`, `role_id`, `budget_id`, `max_budget_per_user`, `max_budget_per_request`, `spend_scope`, `can_override` |
| `role-guardrails` | `role_guardrails` | `id`, `role_id`, `guardrail_profile_id`, `is_mandatory`, `can_bypass`, `bypass_approval` |
| `role-mcps` | `role_mcps` | `id`, `role_id`, `mcp_server_id`, `access_level`, `can_configure`, `allowed_tools`, `allowed_resources` |
| `role-models` | `role_models` | `id`, `role_id`, `model_id`, `access_level`, `can_fine_tune`, `max_quota_per_request` |
| `role-permissions` | `role_permissions` | `id`, `role_id`, `resource`, `action`, `condition`, `is_active` |
| `role-prompt-registries` | `role_prompt_registries` | `id`, `role_id`, `prompt_registry_id`, `access_level`, `can_fork`, `can_deploy` |
| `role-skills` | `role_skills` | `id`, `role_id`, `skill_id`, `access_level`, `can_invoke`, `can_edit`, `granted_at` |
| `role-virtual-models` | `role_virtual_models` | `id`, `role_id`, `virtual_model_id`, `access_level`, `can_modify_routing` |
| `roles` | `roles` | `id`, `org_id`, `name`, `description`, `scope`, `is_system`, `is_active`, `created_at` |
| `sessions` | `sessions` | `id`, `user_id`, `token_hash`, `ip_address`, `user_agent`, `started_at`, `expires_at`, `last_activity_at`, `is_active` |
| `skills` | `skills` | `id`, `org_id`, `name`, `slug`, `description`, `version`, `frontmatter`, `body`, `status`, `created_by`, `created_at`, `updated_at` |
| `user-budgets` | `user_budgets` | `id`, `user_id`, `role_budget_id`, `budget_id`, `allocated_amount`, `consumed_amount`, `remaining_amount`, `status`, `allocated_at`, `reset_at` |
| `user-roles` | `user_roles` | `id`, `user_id`, `role_id`, `granted_by`, `granted_at`, `expires_at`, `context` |
| `users` | `users` | `id`, `org_id`, `email`, `name`, `auth_provider`, `external_id`, `last_login_at`, `is_active` |
| `virtual-model-rules` | `virtual_model_rules` | `id`, `virtual_model_id`, `target_model_id`, `priority`, `rule_type`, `condition`, `parameters`, `is_active`, `created_at` |
| `virtual-models` | `virtual_models` | `id`, `org_id`, `name`, `slug`, `description`, `default_model_id`, `is_active`, `created_at` |

## Example Requests

### Create Organization

```http
POST /api/v1/organizations
```

Request:

```json
{
  "name": "Acme Corp",
  "slug": "acme-corp",
  "tier": "enterprise",
  "settings": {
    "theme": "dark",
    "sso_enabled": true
  },
  "billing_email": "billing@acme.com"
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "a1111111-1111-1111-1111-111111111111",
    "name": "Acme Corp",
    "slug": "acme-corp",
    "tier": "enterprise",
    "created_at": "2026-06-06T15:00:00Z",
    "updated_at": "2026-06-06T15:00:00Z",
    "is_active": true,
    "settings": {
      "theme": "dark",
      "sso_enabled": true
    },
    "billing_email": "billing@acme.com"
  }
}
```

### Create Child Organization (Hierarchy)

Org hierarchy is stored in `settings.parent_org_id`. There is no dedicated `parent_id` column.

```http
POST /api/v1/organizations
```

Request:

```json
{
  "name": "Acme Engineering",
  "slug": "acme-eng",
  "tier": "enterprise",
  "settings": {
    "parent_org_id": "a1111111-1111-1111-1111-111111111111"
  }
}
```

### List Models

```http
GET /api/v1/models?limit=10&offset=0&org_id=a1111111-1111-1111-1111-111111111111
```

Response `200 OK`:

```json
{
  "data": [
    {
      "id": "model-row-uuid",
      "org_id": "a1111111-1111-1111-1111-111111111111",
      "provider_id": "provider-uuid",
      "model_id": "gpt-4.1",
      "name": "GPT-4.1",
      "modality": "text",
      "capabilities": ["chat", "tools"],
      "max_tokens": 128000,
      "is_active": true,
      "created_at": "2026-06-06T15:00:00Z"
    }
  ],
  "limit": 10,
  "offset": 0
}
```

### Patch User

```http
PATCH /api/v1/users/b1111111-1111-1111-1111-111111111111
```

Request:

```json
{
  "name": "Alice Johnson",
  "is_active": true
}
```

Response `200 OK`:

```json
{
  "data": {
    "id": "b1111111-1111-1111-1111-111111111111",
    "org_id": "a1111111-1111-1111-1111-111111111111",
    "email": "alice@acme.com",
    "name": "Alice Johnson",
    "auth_provider": "google",
    "external_id": "google_12345",
    "last_login_at": "2026-06-06T08:30:00Z",
    "is_active": true
  }
}
```

### Create Rate Limit Rule

Requires migration `001_add_rate_limits_pii_skills.sql`.

```http
POST /api/v1/rate-limits
```

Request:

```json
{
  "org_id": "a1111111-1111-1111-1111-111111111111",
  "name": "Default RPM Limit",
  "scope": "org",
  "limit_type": "rpm",
  "limit_value": 60,
  "window_seconds": 60,
  "priority": 0,
  "is_active": true
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "c1111111-1111-1111-1111-111111111111",
    "org_id": "a1111111-1111-1111-1111-111111111111",
    "name": "Default RPM Limit",
    "scope": "org",
    "scope_id": null,
    "limit_type": "rpm",
    "limit_value": 60,
    "window_seconds": 60,
    "is_active": true,
    "priority": 0,
    "created_at": "2026-06-06T15:00:00Z",
    "updated_at": "2026-06-06T15:00:00Z"
  }
}
```

### Create PII Object

Requires migration `001_add_rate_limits_pii_skills.sql`.

```http
POST /api/v1/pii-objects
```

Request:

```json
{
  "org_id": "a1111111-1111-1111-1111-111111111111",
  "name": "Credit Card Number",
  "detection_method": "regex",
  "pattern": "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
  "masking_style": "redact",
  "min_confidence": 0.95,
  "is_active": true
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "d1111111-1111-1111-1111-111111111111",
    "org_id": "a1111111-1111-1111-1111-111111111111",
    "name": "Credit Card Number",
    "description": null,
    "detection_method": "regex",
    "pattern": "\\b\\d{4}[- ]?\\d{4}[- ]?\\d{4}[- ]?\\d{4}\\b",
    "masking_style": "redact",
    "replacement_text": "[REDACTED]",
    "min_confidence": "0.95",
    "is_active": true,
    "created_at": "2026-06-06T15:00:00Z"
  }
}
```

### Create Skill

Requires migration `001_add_rate_limits_pii_skills.sql`.

```http
POST /api/v1/skills
```

Request:

```json
{
  "org_id": "a1111111-1111-1111-1111-111111111111",
  "name": "SQL Assistant",
  "slug": "sql-assistant",
  "version": "1.0.0",
  "status": "draft",
  "frontmatter": {
    "description": "Generates and explains SQL queries",
    "models": ["claude-sonnet-4-6"],
    "tools": ["execute_sql"]
  },
  "body": "# SQL Assistant\n\nYou are an expert SQL developer..."
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "e1111111-1111-1111-1111-111111111111",
    "org_id": "a1111111-1111-1111-1111-111111111111",
    "name": "SQL Assistant",
    "slug": "sql-assistant",
    "description": null,
    "version": "1.0.0",
    "frontmatter": {
      "description": "Generates and explains SQL queries",
      "models": ["claude-sonnet-4-6"],
      "tools": ["execute_sql"]
    },
    "body": "# SQL Assistant\n\nYou are an expert SQL developer...",
    "status": "draft",
    "created_by": null,
    "created_at": "2026-06-06T15:00:00Z",
    "updated_at": "2026-06-06T15:00:00Z"
  }
}
```

### Grant Role Access to a Skill

Requires migration `001_add_rate_limits_pii_skills.sql`.

```http
POST /api/v1/role-skills
```

Request:

```json
{
  "role_id": "r1111111-1111-1111-1111-111111111111",
  "skill_id": "e1111111-1111-1111-1111-111111111111",
  "access_level": "use",
  "can_invoke": true,
  "can_edit": false
}
```

Response `201 Created`:

```json
{
  "data": {
    "id": "f1111111-1111-1111-1111-111111111111",
    "role_id": "r1111111-1111-1111-1111-111111111111",
    "skill_id": "e1111111-1111-1111-1111-111111111111",
    "access_level": "use",
    "can_invoke": true,
    "can_edit": false,
    "granted_at": "2026-06-06T15:00:00Z"
  }
}
```

### List Role-Skill Access for a Role

```http
GET /api/v1/role-skills?limit=100
```

To filter by role client-side, fetch all and filter on `role_id`. The generic catalog does not support multi-column filtering beyond `org_id`.

## Migration Notes

The base schema (`ai_gateway_schema.sql`) creates 30 tables. Four additional tables are added by:

```text
docs/migrations/001_add_rate_limits_pii_skills.sql
```

Apply this migration after loading the base schema:

```sql
\i docs/ai_gateway_schema.sql
\i docs/ai_gateway_sample_data_02.sql
\i docs/migrations/001_add_rate_limits_pii_skills.sql
```

The migration is idempotent (`CREATE TABLE IF NOT EXISTS`).
