-- Migration 008: Guardrail Profiles — type, entity mapping, and FK links
-- Adds:
--   • profile_type   (organization | individual | machine)
--   • entity_type    (organization | individual) — what kind of entity this profile is assigned to
--   • entity_id      UUID — polymorphic reference to organizations.id or users.id
--   • budget_id      FK → budgets(id) — at most ONE budget per profile
--   • rate_limit_id  FK → rate_limits(id) — at most ONE rate-limit rule per profile
--   • guardrail_profile_pii_objects — junction table for many-to-many PII objects

-- ── 1. New columns on guardrail_profiles ────────────────────────────────────

ALTER TABLE guardrail_profiles
  ADD COLUMN IF NOT EXISTS profile_type VARCHAR(20)
    CHECK (profile_type IN ('organization', 'individual', 'machine')),

  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(20)
    CHECK (entity_type IN ('organization', 'individual')),

  -- Polymorphic reference; no FK constraint because it may point to either
  -- organizations or users depending on entity_type.
  ADD COLUMN IF NOT EXISTS entity_id UUID,

  -- One budget per profile; NULL means no budget constraint attached.
  ADD COLUMN IF NOT EXISTS budget_id UUID
    REFERENCES budgets(id) ON DELETE SET NULL,

  -- One rate-limit rule per profile; NULL means no rate limit attached.
  ADD COLUMN IF NOT EXISTS rate_limit_id UUID
    REFERENCES rate_limits(id) ON DELETE SET NULL;

-- ── 2. Indexes for new FK / lookup columns ──────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_guardrail_profiles_entity
  ON guardrail_profiles (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_guardrail_profiles_budget
  ON guardrail_profiles (budget_id);

CREATE INDEX IF NOT EXISTS idx_guardrail_profiles_rate_limit
  ON guardrail_profiles (rate_limit_id);

-- ── 3. Junction table: guardrail_profile ↔ pii_objects (many-to-many) ───────

CREATE TABLE IF NOT EXISTS guardrail_profile_pii_objects (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guardrail_profile_id UUID NOT NULL
    REFERENCES guardrail_profiles(id) ON DELETE CASCADE,
  pii_object_id        UUID NOT NULL
    REFERENCES pii_objects(id)        ON DELETE CASCADE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),

  -- Each PII object may appear at most once per profile.
  CONSTRAINT uq_guardrail_profile_pii UNIQUE (guardrail_profile_id, pii_object_id)
);

CREATE INDEX IF NOT EXISTS idx_gppo_guardrail_profile
  ON guardrail_profile_pii_objects (guardrail_profile_id);

CREATE INDEX IF NOT EXISTS idx_gppo_pii_object
  ON guardrail_profile_pii_objects (pii_object_id);
