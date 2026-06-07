-- Migration 002: Add provider_accounts table, enhance models table
-- Idempotent: uses CREATE TABLE IF NOT EXISTS and ADD COLUMN IF NOT EXISTS
-- Target: PostgreSQL 16
-- Run as: psql -h <host> -U <user> -d aigateway1 -f 002_add_provider_accounts.sql

BEGIN;

-- ─── provider_accounts ────────────────────────────────────────────────────────
-- Stores upstream AI provider credentials (one account per provider per org).
-- api_key is stored as plaintext in this prototype — encrypt in production.
-- Ollama uses endpoint_url instead of api_key.
CREATE TABLE IF NOT EXISTS provider_accounts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL,
    provider_type   TEXT        NOT NULL
                    CHECK (provider_type IN (
                        'openai', 'anthropic', 'azure', 'google', 'aws',
                        'mistral', 'moonshot', 'qwen', 'perplexity', 'ollama'
                    )),
    api_key         TEXT,                          -- null for Ollama; never expose raw to client
    endpoint_url    TEXT,                          -- required for Ollama; base URL for Azure
    region          TEXT,                          -- e.g. us-east-1 (AWS Bedrock)
    extra_config    JSONB       NOT NULL DEFAULT '{}',
                                                   -- { resource_name, api_version, project_id }
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_provider_accounts_org_slug UNIQUE (org_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_org_id
    ON provider_accounts(org_id);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_type
    ON provider_accounts(provider_type);

CREATE INDEX IF NOT EXISTS idx_provider_accounts_active
    ON provider_accounts(org_id, is_active);

DROP TRIGGER IF EXISTS update_provider_accounts_updated_at ON provider_accounts;
CREATE TRIGGER update_provider_accounts_updated_at
    BEFORE UPDATE ON provider_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE provider_accounts IS 'Upstream AI provider credentials and connection settings (one per provider per org).';
COMMENT ON COLUMN provider_accounts.api_key IS 'Raw API key — plaintext in prototype; must be encrypted in production.';
COMMENT ON COLUMN provider_accounts.endpoint_url IS 'Required for Ollama; base URL for Azure (e.g. https://<name>.openai.azure.com).';
COMMENT ON COLUMN provider_accounts.region IS 'AWS Bedrock region (e.g. us-east-1, eu-west-1).';
COMMENT ON COLUMN provider_accounts.extra_config IS 'Provider-specific config: { resource_name, api_version, project_id }.';

-- ─── models table enhancements ────────────────────────────────────────────────

-- context_window: total input+output context the model can handle (differs from
-- max_tokens which is the output-only ceiling).
ALTER TABLE models ADD COLUMN IF NOT EXISTS context_window INTEGER;

-- deployment_name: Azure OpenAI uses a custom deployment name that may differ
-- from the canonical model_id (e.g. "my-gpt4" vs "gpt-4o").
ALTER TABLE models ADD COLUMN IF NOT EXISTS deployment_name TEXT;

-- Make provider_id nullable. The original schema declared it NOT NULL but
-- without a FK reference, so existing rows have arbitrary UUIDs. Dropping
-- NOT NULL lets old rows coexist with new rows that reference provider_accounts.
ALTER TABLE models ALTER COLUMN provider_id DROP NOT NULL;

COMMENT ON COLUMN models.context_window IS 'Total context window in tokens (input + output combined). Separate from max_tokens (output only).';
COMMENT ON COLUMN models.deployment_name IS 'Azure deployment name. May differ from model_id for Azure OpenAI accounts.';

COMMIT;
