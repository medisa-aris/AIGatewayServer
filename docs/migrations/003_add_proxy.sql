-- ─── Migration 003: AI Proxy ─────────────────────────────────────────────────
-- Adds two tables to support the local AI proxy feature:
--   proxy_settings  — per-org enable/disable toggle and bind address
--   proxy_endpoints — individual proxy ports forwarding to provider accounts

BEGIN;

-- ─── proxy_settings ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proxy_settings (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID        NOT NULL UNIQUE,
  is_enabled   BOOLEAN     NOT NULL DEFAULT false,
  bind_address TEXT        NOT NULL DEFAULT '127.0.0.1',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  proxy_settings              IS 'Per-org AI proxy on/off state and bind address.';
COMMENT ON COLUMN proxy_settings.org_id       IS 'One row per organisation.';
COMMENT ON COLUMN proxy_settings.is_enabled   IS 'Whether the local proxy server is active.';
COMMENT ON COLUMN proxy_settings.bind_address IS 'Interface the proxy binds to (default 127.0.0.1).';

DROP TRIGGER IF EXISTS trg_proxy_settings_updated_at ON proxy_settings;
CREATE TRIGGER trg_proxy_settings_updated_at
  BEFORE UPDATE ON proxy_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── proxy_endpoints ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS proxy_endpoints (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID        NOT NULL,
  provider_account_id UUID        REFERENCES provider_accounts(id) ON DELETE SET NULL,
  dialect             TEXT        NOT NULL DEFAULT 'openai'
                        CHECK (dialect IN ('openai', 'anthropic', 'ollama', 'azure')),
  port                INTEGER     NOT NULL CHECK (port BETWEEN 1024 AND 65535),
  session_ttl         INTEGER     NOT NULL DEFAULT 30,
  name                TEXT,
  is_active           BOOLEAN     NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, port)
);

COMMENT ON TABLE  proxy_endpoints                      IS 'Local proxy ports that forward to provider accounts.';
COMMENT ON COLUMN proxy_endpoints.org_id               IS 'Owner organisation.';
COMMENT ON COLUMN proxy_endpoints.provider_account_id  IS 'Target provider account (nullable — may be unlinked).';
COMMENT ON COLUMN proxy_endpoints.dialect              IS 'API format: openai | anthropic | ollama | azure.';
COMMENT ON COLUMN proxy_endpoints.port                 IS 'Local port (1024–65535); unique per org.';
COMMENT ON COLUMN proxy_endpoints.session_ttl          IS 'Idle connection TTL in minutes.';
COMMENT ON COLUMN proxy_endpoints.name                 IS 'Optional human-readable label.';

CREATE INDEX IF NOT EXISTS idx_proxy_endpoints_org_id
  ON proxy_endpoints(org_id);

CREATE INDEX IF NOT EXISTS idx_proxy_endpoints_provider_account
  ON proxy_endpoints(provider_account_id)
  WHERE provider_account_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_proxy_endpoints_updated_at ON proxy_endpoints;
CREATE TRIGGER trg_proxy_endpoints_updated_at
  BEFORE UPDATE ON proxy_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMIT;
