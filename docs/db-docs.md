# AI Gateway Database Documentation

Generated from:

- `docs/ai_gateway_schema.sql`
- `docs/ai_gateway_sample_data_02.sql`
- `docs/migrations/001_add_rate_limits_pii_skills.sql`

Target database: PostgreSQL 16

## Overview

The AI Gateway database is a multi-tenant schema for managing organizations, users, roles, budgets, guardrails, prompt registries, AI models, virtual model routing, MCP integrations, skills, rate limits, PII detection, API access, sessions, request logs, budget consumption, and guardrail violations.

Every tenant-owned resource is rooted in `organizations`. Most operational tables either reference `organizations` directly or reference a user, role, model, prompt, budget, guardrail, MCP, or skill record that belongs to an organization.

## Source Files

| File | Purpose |
| --- | --- |
| `ai_gateway_schema.sql` | Creates extensions, tables, indexes, comments, triggers, foreign keys, and reporting views. Defines 30 base tables. |
| `ai_gateway_sample_data_02.sql` | Truncates existing data and inserts sample records for all 30 base tables. |
| `migrations/001_add_rate_limits_pii_skills.sql` | Adds 4 tables: `rate_limits`, `pii_objects`, `skills`, `role_skills`. Idempotent. |

## Required Extensions

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
```

The schema uses UUID primary keys and `gen_random_uuid()` defaults.

## Loading Order

Run the base schema and sample data first, then apply migrations:

```sql
\i docs/ai_gateway_schema.sql
\i docs/ai_gateway_sample_data_02.sql
\i docs/migrations/001_add_rate_limits_pii_skills.sql
```

The sample data file starts with:

```sql
TRUNCATE TABLE ... RESTART IDENTITY CASCADE;
```

This clears existing rows from all base tables before inserting the sample dataset. The migration file is idempotent and safe to re-run.

## Data Domains

| Domain | Tables |
| --- | --- |
| Tenant and identity | `organizations`, `users`, `roles`, `user_roles`, `role_permissions` |
| Budgets and spend | `budgets`, `role_budgets`, `user_budgets`, `budget_consumptions` |
| Guardrails | `guardrail_profiles`, `role_guardrails`, `guardrail_violations` |
| Prompt registry | `prompt_registries`, `role_prompt_registries`, `prompt_versions`, `prompt_deployments` |
| Models and routing | `models`, `role_models`, `model_versions`, `pricing_tiers`, `virtual_models`, `role_virtual_models`, `virtual_model_rules` |
| MCP integrations | `mcp_servers`, `role_mcps`, `mcp_tools`, `mcp_capabilities` |
| Access and telemetry | `api_keys`, `sessions`, `request_logs` |
| Skills *(migration 001)* | `skills`, `role_skills` |
| Rate limits *(migration 001)* | `rate_limits` |
| PII protection *(migration 001)* | `pii_objects` |

## Table Catalog

| # | Table | Purpose | Source |
| --- | --- | --- | --- |
| 1 | `organizations` | Root tenant entity. All resources belong to exactly one organization. | base schema |
| 2 | `users` | Users within an organization, authenticated by an external provider. | base schema |
| 3 | `roles` | Role definitions scoped to an organization. | base schema |
| 4 | `user_roles` | User-to-role grants with grant metadata. | base schema |
| 5 | `role_permissions` | Granular permissions by resource and action. | base schema |
| 6 | `budgets` | Organization-level budget pools with periods. | base schema |
| 7 | `role_budgets` | Role-level budget policies and spend ceilings. | base schema |
| 8 | `user_budgets` | Per-user allocations derived from role budget policies. | base schema |
| 9 | `guardrail_profiles` | Reusable guardrail policy bundles. | base schema |
| 10 | `role_guardrails` | Role-to-guardrail enforcement bindings. | base schema |
| 11 | `prompt_registries` | Collections of versioned prompt templates. | base schema |
| 12 | `role_prompt_registries` | Role access to prompt registries. | base schema |
| 13 | `prompt_versions` | Versioned prompt templates. | base schema |
| 14 | `prompt_deployments` | Deployed prompt versions exposed by endpoint alias. | base schema |
| 15 | `models` | Base AI models registered from upstream providers. | base schema |
| 16 | `role_models` | Role access to base models. | base schema |
| 17 | `model_versions` | Versioned model deployment configuration. | base schema |
| 18 | `pricing_tiers` | Time-bounded model pricing. | base schema |
| 19 | `virtual_models` | Rule-based model proxies. | base schema |
| 20 | `role_virtual_models` | Role access to virtual models. | base schema |
| 21 | `virtual_model_rules` | Priority-ordered virtual model routing rules. | base schema |
| 22 | `mcp_servers` | Registered Model Context Protocol servers. | base schema |
| 23 | `role_mcps` | Role access to MCP servers. | base schema |
| 24 | `mcp_tools` | Tools exposed by MCP servers. | base schema |
| 25 | `mcp_capabilities` | MCP server capability advertisements. | base schema |
| 26 | `api_keys` | Scoped API keys for programmatic access. | base schema |
| 27 | `sessions` | Active and historical web console sessions. | base schema |
| 28 | `request_logs` | Request audit and analytics log. | base schema |
| 29 | `budget_consumptions` | Spend transactions tied to requests. | base schema |
| 30 | `guardrail_violations` | Recorded guardrail policy breaches. | base schema |
| 31 | `rate_limits` | RPM/TPM/RPD/TPD throttle rules per scope (global/org/role/user). | migration 001 |
| 32 | `pii_objects` | PII detection rules with configurable masking behaviour. | migration 001 |
| 33 | `skills` | Versioned SKILL.md definitions (frontmatter JSONB + markdown body). | migration 001 |
| 34 | `role_skills` | Role ↔ skill access grants (`can_invoke`, `can_edit`). | migration 001 |

Total base tables: 30. Total after migration 001: 34.

## Table Definitions (Migration 001 Tables)

### `rate_limits`

RPM/TPM/RPD/TPD throttle rules. Each row defines a single limit, evaluated in `priority` order (ascending).

| Column | Type | Nullable | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | UUID | NOT NULL | `gen_random_uuid()` | Primary key |
| `org_id` | UUID | NOT NULL | — | Owner organization; `ON DELETE CASCADE` |
| `name` | TEXT | NOT NULL | — | Human-readable rule name |
| `scope` | TEXT | NOT NULL | — | `global`, `org`, `role`, or `user` |
| `scope_id` | UUID | NULL | — | ID of the specific role or user when `scope` is `role` or `user` |
| `limit_type` | TEXT | NOT NULL | — | `rpm`, `tpm`, `rpd`, or `tpd` |
| `limit_value` | INTEGER | NOT NULL | — | Maximum allowed count per window |
| `window_seconds` | INTEGER | NOT NULL | `60` | Rolling window length in seconds |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether the rule is enforced |
| `priority` | INTEGER | NOT NULL | `0` | Evaluation order (lower = higher priority) |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update timestamp (maintained by trigger) |

Indexes: `org_id`, `(scope, scope_id)`, `(org_id, priority)`.

### `pii_objects`

PII detection and masking configuration. Each row defines one type of sensitive data.

| Column | Type | Nullable | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | UUID | NOT NULL | `gen_random_uuid()` | Primary key |
| `org_id` | UUID | NOT NULL | — | Owner organization; `ON DELETE CASCADE` |
| `name` | TEXT | NOT NULL | — | Human-readable label (e.g. "Credit Card Number") |
| `description` | TEXT | NULL | — | Optional description |
| `detection_method` | TEXT | NOT NULL | — | `regex`, `ner`, `llm`, or `dict` |
| `pattern` | TEXT | NULL | — | Regex pattern; used only when `detection_method = 'regex'` |
| `masking_style` | TEXT | NOT NULL | — | `redact`, `replace`, `hash`, or `partial` |
| `replacement_text` | TEXT | NULL | `'[REDACTED]'` | Replacement string; used only when `masking_style = 'replace'` |
| `min_confidence` | NUMERIC(3,2) | NOT NULL | `0.80` | Minimum detection confidence threshold (0.00–1.00) |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether the rule is enforced |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp |

Indexes: `org_id`.

### `skills`

Versioned agent skill definitions stored as SKILL.md. Each row is one version of one skill.

| Column | Type | Nullable | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | UUID | NOT NULL | `gen_random_uuid()` | Primary key |
| `org_id` | UUID | NOT NULL | — | Owner organization; `ON DELETE CASCADE` |
| `name` | TEXT | NOT NULL | — | Human-readable skill name |
| `slug` | TEXT | NOT NULL | — | URL-safe identifier |
| `description` | TEXT | NULL | — | Optional description |
| `version` | TEXT | NOT NULL | `'1.0.0'` | Semantic version string |
| `frontmatter` | JSONB | NOT NULL | `'{}'` | Structured metadata (models, tools, parameters, etc.) |
| `body` | TEXT | NOT NULL | `''` | Markdown body of the SKILL.md file |
| `status` | TEXT | NOT NULL | `'draft'` | `draft`, `published`, or `deprecated` |
| `created_by` | UUID | NULL | — | Author user; `ON DELETE SET NULL` |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update timestamp (maintained by trigger) |

Unique constraint: `(org_id, slug, version)`.
Indexes: `org_id`, `status`.

### `role_skills`

Grants a role the right to invoke and/or edit a specific skill. At most one row per `(role_id, skill_id)` pair.

| Column | Type | Nullable | Default | Description |
| --- | --- | --- | --- | --- |
| `id` | UUID | NOT NULL | `gen_random_uuid()` | Primary key |
| `role_id` | UUID | NOT NULL | — | Grantee role; `ON DELETE CASCADE` |
| `skill_id` | UUID | NOT NULL | — | Granted skill; `ON DELETE CASCADE` |
| `access_level` | TEXT | NOT NULL | `'use'` | `use` or `manage` |
| `can_invoke` | BOOLEAN | NOT NULL | `TRUE` | Whether the role may call/run this skill |
| `can_edit` | BOOLEAN | NOT NULL | `FALSE` | Whether the role may edit skill content |
| `granted_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Grant timestamp |

Unique constraint: `(role_id, skill_id)`.
Indexes: `role_id`, `skill_id`.

## Key Relationships

| Parent | Child Tables |
| --- | --- |
| `organizations` | `users`, `roles`, `budgets`, `guardrail_profiles`, `prompt_registries`, `models`, `virtual_models`, `mcp_servers`, `api_keys`, `rate_limits`, `pii_objects`, `skills` |
| `users` | `user_roles`, `user_budgets`, `budget_consumptions`, `prompt_versions`, `prompt_deployments`, `api_keys`, `sessions`, `request_logs`, `skills` (via `created_by`) |
| `roles` | `user_roles`, `role_permissions`, `role_budgets`, `role_guardrails`, `role_prompt_registries`, `role_models`, `role_virtual_models`, `role_mcps`, `role_skills` |
| `skills` | `role_skills` |
| `budgets` | `role_budgets`, `user_budgets` |
| `role_budgets` | `user_budgets` |
| `user_budgets` | `budget_consumptions` |
| `guardrail_profiles` | `role_guardrails`, `request_logs`, `guardrail_violations` |
| `prompt_registries` | `role_prompt_registries`, `prompt_versions`, `request_logs` |
| `prompt_versions` | `prompt_deployments` |
| `models` | `role_models`, `model_versions`, `pricing_tiers`, `virtual_models`, `virtual_model_rules`, `request_logs` |
| `virtual_models` | `role_virtual_models`, `virtual_model_rules`, `request_logs` |
| `virtual_model_rules` | `request_logs` |
| `mcp_servers` | `role_mcps`, `mcp_tools`, `mcp_capabilities`, `request_logs` |
| `api_keys` | `request_logs` |
| `request_logs` | `budget_consumptions`, `guardrail_violations` |

Most foreign keys use `ON DELETE CASCADE` for tenant-owned child records. `skills.created_by` uses `ON DELETE SET NULL`.

## Important Constraints

| Table | Constraint |
| --- | --- |
| `organizations` | `slug` is unique. |
| `users` | `email` is globally unique; `(org_id, external_id)` is unique. |
| `user_roles` | `(user_id, role_id)` is unique. |
| `role_permissions` | `resource` and `action` are limited by check constraints. |
| `budgets` | `period` is limited to supported billing periods; `period_end > period_start`. |
| `role_budgets` | `(role_id, budget_id)` is unique. |
| `user_budgets` | `(user_id, role_budget_id)` is unique; `status` is constrained. |
| `budget_consumptions` | `usage_type` and `status` are constrained. |
| `role_guardrails` | `(role_id, guardrail_profile_id)` is unique. |
| `prompt_registries` | `slug` is unique. |
| `role_prompt_registries` | `(role_id, prompt_registry_id)` is unique. |
| `prompt_versions` | `(registry_id, version_number)` is unique. |
| `prompt_deployments` | `endpoint_alias` is unique. |
| `models` | `model_id` is globally unique. |
| `role_models` | `(role_id, model_id)` is unique. |
| `model_versions` | `(model_id, version)` is unique. |
| `pricing_tiers` | `effective_to` must be null or later than `effective_from`. |
| `virtual_models` | `slug` is unique. |
| `role_virtual_models` | `(role_id, virtual_model_id)` is unique. |
| `virtual_model_rules` | `(virtual_model_id, priority)` is unique. |
| `mcp_servers` | `slug` is unique. |
| `role_mcps` | `(role_id, mcp_server_id)` is unique. |
| `mcp_tools` | `(mcp_server_id, name)` is unique. |
| `api_keys` | `key_hash` is unique. |
| `sessions` | `token_hash` is unique. |
| `request_logs` | `request_id` is unique. |
| `rate_limits` | `scope` ∈ `{global, org, role, user}`; `limit_type` ∈ `{rpm, tpm, rpd, tpd}`. |
| `pii_objects` | `detection_method` ∈ `{regex, ner, llm, dict}`; `masking_style` ∈ `{redact, replace, hash, partial}`; `min_confidence` in [0.00, 1.00]. |
| `skills` | `(org_id, slug, version)` is unique; `status` ∈ `{draft, published, deprecated}`. |
| `role_skills` | `(role_id, skill_id)` is unique; `access_level` ∈ `{use, manage}`. |

## Enumerated Values

| Column | Allowed Values |
| --- | --- |
| `roles.scope` | `org`, `project`, `system` |
| `role_permissions.resource` | `prompt`, `model`, `virtual_model`, `mcp`, `budget`, `guardrail`, `user`, `role`, `org`, `analytics` |
| `role_permissions.action` | `create`, `read`, `update`, `delete`, `execute`, `admin` |
| `budgets.period` | `daily`, `weekly`, `monthly`, `quarterly`, `annual` |
| `role_budgets.spend_scope` | `own`, `team`, `org` |
| `user_budgets.status` | `active`, `exhausted`, `frozen` |
| `budget_consumptions.usage_type` | `tokens`, `requests`, `compute_time` |
| `budget_consumptions.status` | `pending`, `committed`, `refunded` |
| `role_guardrails.bypass_approval` | `manager`, `admin`, `auto` |
| `prompt_registries.visibility` | `private`, `team`, `org` |
| `role_prompt_registries.access_level` | `read`, `write`, `execute`, `admin` |
| `prompt_versions.status` | `draft`, `published`, `deprecated` |
| `models.modality` | `text`, `image`, `audio`, `video`, `multimodal` |
| `role_models.access_level` | `read`, `execute`, `admin` |
| `model_versions.deployment_status` | `staging`, `production`, `deprecated` |
| `role_virtual_models.access_level` | `read`, `execute`, `admin` |
| `virtual_model_rules.rule_type` | `price`, `token`, `quality`, `request_type`, `fallback` |
| `mcp_servers.transport` | `stdio`, `sse`, `http` |
| `mcp_servers.status` | `active`, `inactive`, `error` |
| `role_mcps.access_level` | `read`, `execute`, `admin` |
| `mcp_capabilities.capability_type` | `tools`, `resources`, `prompts`, `sampling` |
| `guardrail_violations.rule_type` | `content`, `pii`, `topic`, `rate`, `custom` |
| `guardrail_violations.severity` | `low`, `medium`, `high`, `critical` |
| `guardrail_violations.action_taken` | `block`, `warn`, `mask`, `log`, `allow` |
| `rate_limits.scope` | `global`, `org`, `role`, `user` |
| `rate_limits.limit_type` | `rpm`, `tpm`, `rpd`, `tpd` |
| `pii_objects.detection_method` | `regex`, `ner`, `llm`, `dict` |
| `pii_objects.masking_style` | `redact`, `replace`, `hash`, `partial` |
| `skills.status` | `draft`, `published`, `deprecated` |
| `role_skills.access_level` | `use`, `manage` |

## Indexing Strategy

The schema adds indexes for:

- Tenant lookups, especially `org_id`.
- Common status filters such as `is_active`, `status`, and deployment state.
- Time-series reporting fields such as budget periods, request timestamps, consumption timestamps, and guardrail trigger timestamps.
- Audit correlation fields such as `request_id`, `trace_id`, and API key IDs.
- JSONB search using GIN indexes on prompt tags, model capabilities, and virtual model rule JSON.
- Migration 001 adds indexes on `rate_limits(scope, scope_id)` and `rate_limits(org_id, priority)` for priority-ordered enforcement lookups.

## Views

### `v_user_budget_summary`

Joins `user_budgets`, `users`, `role_budgets`, `roles`, and `budgets` to provide per-user budget allocation, consumption, remaining balance, status, and reset date.

### `v_request_analytics`

Joins `request_logs` with users, models, virtual models, and matched routing rules. Useful for reporting cost, latency, token usage, status codes, routing behavior, and regions.

### `v_guardrail_summary`

Joins `guardrail_violations`, `request_logs`, `users`, and `guardrail_profiles` to summarize policy breaches by user, guardrail profile, rule type, severity, action, and trigger time.

## Triggers

The schema defines an `update_updated_at_column()` function that sets `updated_at = NOW()` on each `UPDATE`. It is attached to:

| Table | Trigger name | Added by |
| --- | --- | --- |
| `organizations` | `update_organizations_updated_at` | base schema |
| `rate_limits` | `update_rate_limits_updated_at` | migration 001 |
| `skills` | `update_skills_updated_at` | migration 001 |

## Provider Inference

There is no `providers` table. Provider identity is inferred from `models.model_id` prefix in application code:

| Prefix | Inferred Provider |
| --- | --- |
| `gpt-` | OpenAI |
| `claude-` | Anthropic |
| `gemini-` | Google |
| `mistral-` | Mistral |
| `nova-` / `titan-` | AWS Bedrock |

This is a heuristic and breaks for custom or non-standard model IDs.

## Org Hierarchy

`organizations` has no `parent_id` column. Hierarchy is stored in the `settings` JSONB field:

```json
{ "parent_org_id": "uuid-of-parent-org" }
```

The `parent_org_id` reference is not enforced by a foreign key; application code is responsible for orphan prevention.

## Sample Data Notes

The sample data (`ai_gateway_sample_data_02.sql`) covers the 30 base tables only. It includes:

- Two organizations: `Acme Corp` (enterprise) and `Beta Labs` (pro).
- Users and roles for both organizations.
- Role permissions and role assignments.
- Shared and role-scoped budgets with user allocations and consumption records.
- Guardrail profiles and violations.
- Prompt registries, prompt versions, and deployed prompt endpoints.
- Base models, model versions, pricing tiers, and virtual model routing.
- MCP servers, tools, capabilities, and role access.
- API keys, sessions, request logs, request costs, and guardrail events.

The four tables added by migration 001 (`rate_limits`, `pii_objects`, `skills`, `role_skills`) have no sample data. Insert rows manually or through the web console after applying the migration.

## Operational Notes

- Load `ai_gateway_schema.sql` before `ai_gateway_sample_data_02.sql`.
- Apply `migrations/001_add_rate_limits_pii_skills.sql` after loading the base schema. The migration is idempotent.
- The sample data file is intended for development or test databases because it truncates all base tables.
- Keep UUID columns populated with valid UUID values. Provider-like strings such as `p-openai-001` are not valid for UUID columns.
- Keep JSONB values valid JSON. Regex strings in JSON need double escaping, for example `\\d` instead of `\d`.
- `models.model_id` is globally unique in the current schema. If the same upstream model is registered for multiple organizations, use distinct `model_id` values or change the schema to a composite uniqueness rule such as `(org_id, model_id)`.
- `skills.(org_id, slug, version)` is unique. Publishing a new version of a skill requires incrementing the `version` field.
- `rate_limits.priority` is unique per `(org_id)` pair in application logic but not enforced by a database constraint. Assign priorities without gaps to avoid ambiguous evaluation order.
- Disabling triggers or changing `session_replication_role` can bypass foreign key checks during loading, but PostgreSQL will not automatically revalidate existing bad rows when constraints are re-enabled.
