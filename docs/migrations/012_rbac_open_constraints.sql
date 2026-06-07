-- Migration 012: open up role_permissions constraints for the new RBAC model.
--
-- The original schema used narrow CHECK constraints on (resource, action) that
-- matched the old 10-resource / 6-action vocabulary. The new RBAC matrix uses
-- nav-aligned resource IDs (e.g. 'provider-accounts', 'guardrail-profiles') and
-- four granular actions (access, read, write, delete). Both sets violate the old
-- CHECKs, causing "store operation failed" (23514 check_violation) on every save.
--
-- This migration:
--   1. Drops the CHECK constraints on resource and action.
--   2. Widens the columns to accommodate longer slugs.
--   3. Adds a UNIQUE constraint on (role_id, resource, action) so toggling a
--      cell on twice does not insert a duplicate row.

BEGIN;

-- 1. Drop the old CHECK constraints (names from information_schema).
ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_resource_check,
  DROP CONSTRAINT IF EXISTS role_permissions_action_check;

-- 2. Widen columns — old limits were VARCHAR(50) / VARCHAR(20).
ALTER TABLE role_permissions
  ALTER COLUMN resource TYPE VARCHAR(100),
  ALTER COLUMN action   TYPE VARCHAR(40);

-- 3. Unique guard so the UI can safely retry without creating duplicates.
ALTER TABLE role_permissions
  ADD CONSTRAINT uq_role_permissions_role_resource_action
  UNIQUE (role_id, resource, action);

COMMIT;
