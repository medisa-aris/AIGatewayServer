-- Migration 011: seed additional users so the guardrail user-search combobox
-- has a realistic population (was only 3 per org in the original sample data).

INSERT INTO users (id, org_id, email, name, auth_provider, external_id, last_login_at, is_active)
VALUES
  -- Acme Corp (a1111111-…)
  ('b6666666-6666-6666-6666-666666666666', 'a1111111-1111-1111-1111-111111111111', 'diana.kim@acme.com',       'Diana Kim',      'okta',   'okta_11111',   '2026-06-05 09:00:00+00', true),
  ('b7777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', 'evan.torres@acme.com',     'Evan Torres',    'google', 'google_22222', '2026-06-04 14:15:00+00', true),
  ('b8888888-8888-8888-8888-888888888888', 'a1111111-1111-1111-1111-111111111111', 'farah.nasution@acme.com',  'Farah Nasution', 'saml',   'saml_33333',   '2026-06-03 10:45:00+00', true),
  ('b9999999-9999-9999-9999-999999999999', 'a1111111-1111-1111-1111-111111111111', 'george.martin@acme.com',   'George Martin',  'google', 'google_44444', '2026-06-05 06:30:00+00', true),
  ('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'hana.wijaya@acme.com',     'Hana Wijaya',    'okta',   'okta_55555',   '2026-06-02 17:00:00+00', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a1111111-1111-1111-1111-111111111111', 'ivan.putra@acme.com',      'Ivan Putra',     'google', 'google_66666', '2026-06-01 09:20:00+00', false),
  ('bccccccc-cccc-cccc-cccc-cccccccccccc', 'a1111111-1111-1111-1111-111111111111', 'julia.santos@acme.com',    'Julia Santos',   'saml',   'saml_77777',   '2026-05-30 15:40:00+00', true),
  -- Beta Labs (a2222222-…)
  ('bddddddd-dddd-dddd-dddd-dddddddddddd', 'a2222222-2222-2222-2222-222222222222', 'frank.liu@betalabs.io',    'Frank Liu',      'google', 'google_88888', '2026-06-04 13:00:00+00', true),
  ('beeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a2222222-2222-2222-2222-222222222222', 'grace.park@betalabs.io',   'Grace Park',     'okta',   'okta_99999',   '2026-06-05 08:00:00+00', true),
  ('bfffffff-ffff-ffff-ffff-ffffffffffff', 'a2222222-2222-2222-2222-222222222222', 'henry.zhao@betalabs.io',   'Henry Zhao',     'saml',   'saml_22222',   '2026-06-02 12:30:00+00', true)
ON CONFLICT (id) DO NOTHING;
