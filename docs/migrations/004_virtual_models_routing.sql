-- Migration 004: Add routing_config JSONB to virtual_models
-- Stores per-virtual-model routing strategy: auto_route flag, decision engine choice,
-- fallback chain, and classifier model selection.

BEGIN;

ALTER TABLE virtual_models
  ADD COLUMN IF NOT EXISTS routing_config JSONB;

COMMIT;
