# RBAC Permissions Matrix

This document defines every resource exposed in the RBAC matrix on the **Users & Roles → RBAC Matrix** screen, the four standard actions available per resource, and the semantics of each combination.

---

## Action Granularity

| Abbr | Action | Meaning |
|------|--------|---------|
| **A** | **Access** | The role can see this menu item in the sidebar. Without Access the entire screen is invisible to the user. |
| **R** | **Read** | The role can list records and open detail views. Grants visibility into data but no mutation. |
| **W** | **Write** | The role can create new records and edit existing ones (PUT/PATCH). Requires Read to be meaningful. |
| **D** | **Delete** | The role can delete records. Soft-delete (deactivate `is_active`) or hard-delete depending on the resource (see per-resource notes below). |

> The four actions are stored as `action` strings (`access`, `read`, `write`, `delete`) in the `role_permissions` table alongside the `resource` identifier.

---

## Resource Catalogue

Resources are grouped by the nav section they belong to. The `resource` column is the exact string stored in `role_permissions.resource`.

### Monitor

| Resource | `resource` value | Write semantics | Delete semantics |
|----------|-----------------|-----------------|-----------------|
| Overview | `overview` | n/a — analytics screen | n/a |
| Model Metrics | `model-metrics` | n/a — analytics screen | n/a |
| Guardrail Activity | `guardrail-activity` | n/a — violation log read-only | n/a |
| Request Logs | `request-logs` | n/a — append-only by gateway | Hard delete (admin purge) |
| Dimensional Viewer | `dimensional` | n/a — analytics screen | n/a |

> Monitor screens are primarily read-only analytics. Granting Write/Delete is reserved for future admin purge operations. Access + Read is the typical grant for operators.

---

### Gateway

| Resource | `resource` value | Write semantics | Delete semantics |
|----------|-----------------|-----------------|-----------------|
| Provider Accounts | `provider-accounts` | Create/edit upstream provider credentials | Soft-delete (`is_active = false`) |
| Virtual Models | `virtual-models` | Create/edit virtual model definitions and routing rules | Soft-delete |
| Proxy | `proxy` | Enable/disable proxy, add/edit proxy endpoints | Soft-delete endpoint rows |
| Proxy Services | `proxy-services` | Assign/revoke proxy endpoints, MCP servers, skills, and guardrail profiles to users and organizations | Delete junction row (revocation) |

---

### Registry

| Resource | `resource` value | Write semantics | Delete semantics |
|----------|-----------------|-----------------|-----------------|
| Prompts | `prompt-registries` | Create/edit prompt registry entries and versions | Soft-delete registry entry |
| MCP Servers | `mcp-servers` | Register/configure MCP servers and tools | Soft-delete |
| Skills | `skills` | Author/publish SKILL.md definitions | Soft-delete (`status = archived`) |

---

### Policies

| Resource | `resource` value | Write semantics | Delete semantics |
|----------|-----------------|-----------------|-----------------|
| Guardrails | `guardrail-profiles` | Create/edit guardrail profiles; attach PII objects and rate-limit rules | Soft-delete |
| PII Protection | `pii-objects` | Create/edit PII detection rules and masking configuration | Soft-delete |
| Budgets | `budgets` | Create/edit budget envelopes; allocate to users or roles | Soft-delete |
| Rate Limits | `rate-limits` | Create/edit RPM/TPM/RPD/TPD limit rules | Soft-delete |

---

### Administration

| Resource | `resource` value | Write semantics | Delete semantics |
|----------|-----------------|-----------------|-----------------|
| Users | `users` | Create users; edit profile fields | Soft-delete (`is_active = false`) — not hard-delete |
| Roles | `roles` | Create custom roles; edit name, description, scope | Soft-delete — system roles (`is_system = true`) cannot be deleted |
| Organization | `organizations` | Edit org name, slug, billing email, settings JSONB | Soft-delete child orgs only; root org protected |
| API Tokens | `api-keys` | Create API keys; set scope and expiry | Hard-delete key row (revocation) |
| Authentication | `auth` | Configure SSO/Entra/AD settings (stub) | n/a |
| Database ERD | `erd` | View live entity-relationship diagram of the gateway schema | n/a — read-only viewer |
| Configuration | `config` | Persist gateway config to `organizations.settings` JSONB | n/a |

---

## Typical Role Profiles

The following grants are illustrative starting points, not enforced defaults.

| Role | Typical grants |
|------|---------------|
| **Gateway Admin** | All A + R + W + D across all resources |
| **Operator** | Monitor: A+R; Gateway (incl. Proxy Services): A+R+W; Registry: A+R+W; Policies: A+R |
| **Developer** | Monitor: A+R; Proxy Services: A+R; Registry: A+R+W; Policies: A+R |
| **Auditor** | All A + R only (no Write, no Delete) |
| **Viewer** | Monitor: A+R only |

---

## Storage Schema

Permissions are stored in the `role_permissions` table:

```sql
CREATE TABLE role_permissions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  resource   TEXT NOT NULL,   -- e.g. 'provider-accounts'
  action     TEXT NOT NULL,   -- 'access' | 'read' | 'write' | 'delete'
  condition  JSONB,           -- reserved for future attribute-based conditions
  is_active  BOOLEAN NOT NULL DEFAULT true
);
```

The UI batches changes and POSTs new rows (on check) or DELETEs existing rows (on uncheck) via `POST /api/v1/role-permissions` and `DELETE /api/v1/role-permissions/:id`.

---

## Notes

- **Access without Read** — a user can see the menu item but gets an empty table / no data. This is valid for staged rollouts.
- **Write without Read** — the create form can be used but the user cannot see the list. Unusual but valid for submission-only flows.
- **Delete without Write** — allows purging records without the ability to create or edit. Useful for a dedicated purge role.
- **System roles** (`is_system = true`) are seeded by migrations and should not be deleted via the UI. The UI already omits the delete action for system roles.
