-- Migration 007: Seed sample rate-limit rules
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- Requires orgs a1111111... (Acme Corp) and a2222222... (Beta Labs) from sample data.

-- ─── Acme Corp (a1111111...) ──────────────────────────────────────────────────

INSERT INTO rate_limits (id, org_id, name, scope, scope_id, limit_type, limit_value, window_seconds, is_active, priority)
VALUES
  ('00100001-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme Global RPM Cap',
   'org', NULL,
   'rpm', 2000, 60,
   TRUE, 100),

  ('00100002-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme Daily Token Limit',
   'org', NULL,
   'tpd', 5000000, 86400,
   TRUE, 90),

  ('00100003-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme User RPM Limit',
   'user', NULL,
   'rpm', 60, 60,
   TRUE, 50),

  ('00100004-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme User Token-per-Minute',
   'user', NULL,
   'tpm', 100000, 60,
   TRUE, 40)

ON CONFLICT (id) DO NOTHING;

-- ─── Beta Labs (a2222222...) ──────────────────────────────────────────────────

INSERT INTO rate_limits (id, org_id, name, scope, scope_id, limit_type, limit_value, window_seconds, is_active, priority)
VALUES
  ('00100005-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Beta Global RPM Cap',
   'org', NULL,
   'rpm', 500, 60,
   TRUE, 100),

  ('00100006-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Beta Daily Request Limit',
   'org', NULL,
   'rpd', 50000, 86400,
   TRUE, 90),

  ('00100007-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Beta User RPM Limit',
   'user', NULL,
   'rpm', 30, 60,
   TRUE, 50)

ON CONFLICT (id) DO NOTHING;
