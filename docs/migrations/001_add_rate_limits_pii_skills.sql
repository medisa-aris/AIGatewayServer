-- Migration 001: Add rate_limits, pii_objects, skills, role_skills tables
-- Idempotent: uses CREATE TABLE IF NOT EXISTS
-- Target: PostgreSQL 16
-- Run as: psql -h localhost -U gateway_user -d aigateway1 -f 001_add_rate_limits_pii_skills.sql

BEGIN;

-- ─── rate_limits ────────────────────────────────────────────────────────────
-- Stores RPM/TPM/RPD/TPD rate-limiting rules scoped to org/role/user.
CREATE TABLE IF NOT EXISTS rate_limits (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  scope          TEXT        NOT NULL CHECK (scope IN ('global','org','role','user')),
  scope_id       UUID,
  limit_type     TEXT        NOT NULL CHECK (limit_type IN ('rpm','tpm','rpd','tpd')),
  limit_value    INTEGER     NOT NULL,
  window_seconds INTEGER     NOT NULL DEFAULT 60,
  is_active      BOOLEAN     NOT NULL DEFAULT TRUE,
  priority       INTEGER     NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_org_id
  ON rate_limits(org_id);

CREATE INDEX IF NOT EXISTS idx_rate_limits_scope
  ON rate_limits(scope, scope_id);

CREATE INDEX IF NOT EXISTS idx_rate_limits_priority
  ON rate_limits(org_id, priority);

DROP TRIGGER IF EXISTS update_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER update_rate_limits_updated_at
  BEFORE UPDATE ON rate_limits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── pii_objects ─────────────────────────────────────────────────────────────
-- Defines PII detection rules: what to detect and how to mask it.
CREATE TABLE IF NOT EXISTS pii_objects (
  id               UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID           NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             TEXT           NOT NULL,
  description      TEXT,
  detection_method TEXT           NOT NULL CHECK (detection_method IN ('regex','ner','llm','dict')),
  pattern          TEXT,
  masking_style    TEXT           NOT NULL CHECK (masking_style IN ('redact','replace','hash','partial')),
  replacement_text TEXT           DEFAULT '[REDACTED]',
  min_confidence   NUMERIC(3,2)   NOT NULL DEFAULT 0.80,
  is_active        BOOLEAN        NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pii_objects_org_id
  ON pii_objects(org_id);

CREATE INDEX IF NOT EXISTS idx_pii_objects_is_active
  ON pii_objects(org_id, is_active);

-- ─── skills ──────────────────────────────────────────────────────────────────
-- Versioned skill definitions stored as SKILL.md (frontmatter + markdown body).
CREATE TABLE IF NOT EXISTS skills (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  description TEXT,
  version     TEXT        NOT NULL DEFAULT '1.0.0',
  frontmatter JSONB       NOT NULL DEFAULT '{}',
  body        TEXT        NOT NULL DEFAULT '',
  status      TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','published','deprecated')),
  created_by  UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, slug, version)
);

CREATE INDEX IF NOT EXISTS idx_skills_org_id
  ON skills(org_id);

CREATE INDEX IF NOT EXISTS idx_skills_status
  ON skills(org_id, status);

DROP TRIGGER IF EXISTS update_skills_updated_at ON skills;
CREATE TRIGGER update_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── role_skills ─────────────────────────────────────────────────────────────
-- Controls which roles are allowed to invoke which skills.
CREATE TABLE IF NOT EXISTS role_skills (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id      UUID        NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  skill_id     UUID        NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  access_level TEXT        NOT NULL DEFAULT 'use'
                 CHECK (access_level IN ('use','manage')),
  can_invoke   BOOLEAN     NOT NULL DEFAULT TRUE,
  can_edit     BOOLEAN     NOT NULL DEFAULT FALSE,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (role_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_role_skills_role_id
  ON role_skills(role_id);

CREATE INDEX IF NOT EXISTS idx_role_skills_skill_id
  ON role_skills(skill_id);

COMMIT;
