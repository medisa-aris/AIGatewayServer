-- Migration 005: Add virtual model routing to proxy endpoints
--
-- When dialect = 'ollama', an endpoint may route to a virtual model
-- instead of a provider account. target_type discriminates which FK is active.

BEGIN;

ALTER TABLE proxy_endpoints
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'provider_account'
    CHECK (target_type IN ('provider_account', 'virtual_model')),
  ADD COLUMN IF NOT EXISTS virtual_model_id UUID
    REFERENCES virtual_models(id) ON DELETE SET NULL;

COMMENT ON COLUMN proxy_endpoints.target_type IS
  'Routing target discriminator: provider_account (default) or virtual_model (Ollama only)';
COMMENT ON COLUMN proxy_endpoints.virtual_model_id IS
  'Target virtual model when target_type = ''virtual_model''; NULL otherwise';

COMMIT;
