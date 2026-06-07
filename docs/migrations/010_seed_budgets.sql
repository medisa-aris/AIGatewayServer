-- Migration 010: Seed sample budgets
-- Safe to re-run (ON CONFLICT DO NOTHING).
-- Requires orgs a1111111... (Acme Corp) and a2222222... (Beta Labs) from sample data.

-- ─── Acme Corp (a1111111...) ──────────────────────────────────────────────────

INSERT INTO budgets (id, org_id, name, total_amount, remaining_amount, currency, period, period_start, period_end, is_active, is_shared)
VALUES
  ('00200001-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme Monthly LLM Budget',
   10000.000000, 8241.500000,
   'USD', 'monthly',
   '2026-06-01 00:00:00+00', '2026-06-30 23:59:59+00',
   TRUE, FALSE),

  ('00200002-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme Shared Research Pool',
   25000.000000, 19876.320000,
   'USD', 'quarterly',
   '2026-04-01 00:00:00+00', '2026-06-30 23:59:59+00',
   TRUE, TRUE),

  ('00200003-0000-0000-0000-000000000000',
   'a1111111-1111-1111-1111-111111111111',
   'Acme Daily Dev Sandbox',
   500.000000, 312.750000,
   'USD', 'daily',
   '2026-06-07 00:00:00+00', '2026-06-07 23:59:59+00',
   TRUE, FALSE)

ON CONFLICT (id) DO NOTHING;

-- ─── Beta Labs (a2222222...) ──────────────────────────────────────────────────

INSERT INTO budgets (id, org_id, name, total_amount, remaining_amount, currency, period, period_start, period_end, is_active, is_shared)
VALUES
  ('00200004-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Beta Monthly Operations',
   3000.000000, 2105.800000,
   'USD', 'monthly',
   '2026-06-01 00:00:00+00', '2026-06-30 23:59:59+00',
   TRUE, FALSE),

  ('00200005-0000-0000-0000-000000000000',
   'a2222222-2222-2222-2222-222222222222',
   'Beta Q2 Innovation Fund',
   8000.000000, 5440.000000,
   'USD', 'quarterly',
   '2026-04-01 00:00:00+00', '2026-06-30 23:59:59+00',
   TRUE, TRUE)

ON CONFLICT (id) DO NOTHING;
