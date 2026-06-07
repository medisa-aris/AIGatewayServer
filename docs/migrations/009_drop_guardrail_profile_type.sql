-- Migration 013: direct user→resource and org→resource junction tables for Proxy Services.
--
-- These tables allow assigning specific proxy endpoints, MCP servers, skills,
-- and guardrail profiles directly to users or organizations, independently of
-- the role-based access control chain.

BEGIN;

-- ── User-scoped mappings ──────────────────────────────────────────────────────

CREATE TABLE user_proxy_endpoints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proxy_endpoint_id UUID        NOT NULL REFERENCES proxy_endpoints(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, proxy_endpoint_id)
);

CREATE TABLE user_mcp_servers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mcp_server_id UUID        NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, mcp_server_id)
);

CREATE TABLE user_skills (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_id   UUID        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, skill_id)
);

CREATE TABLE user_guardrails (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  guardrail_profile_id UUID        NOT NULL REFERENCES guardrail_profiles(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, guardrail_profile_id)
);

-- ── Org-scoped mappings ───────────────────────────────────────────────────────

CREATE TABLE org_proxy_endpoints (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  proxy_endpoint_id UUID        NOT NULL REFERENCES proxy_endpoints(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, proxy_endpoint_id)
);

CREATE TABLE org_mcp_servers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  mcp_server_id UUID        NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, mcp_server_id)
);

CREATE TABLE org_skills (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  skill_id   UUID        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, skill_id)
);

CREATE TABLE org_guardrails (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  guardrail_profile_id UUID        NOT NULL REFERENCES guardrail_profiles(id) ON DELETE CASCADE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, guardrail_profile_id)
);

COMMIT;

