ALTER TABLE guardrail_violations DISABLE TRIGGER ALL;
ALTER TABLE budget_consumptions DISABLE TRIGGER ALL;
ALTER TABLE request_logs DISABLE TRIGGER ALL;
ALTER TABLE sessions DISABLE TRIGGER ALL;
ALTER TABLE api_keys DISABLE TRIGGER ALL;
ALTER TABLE mcp_capabilities DISABLE TRIGGER ALL;
ALTER TABLE mcp_tools DISABLE TRIGGER ALL;
ALTER TABLE role_mcps DISABLE TRIGGER ALL;
ALTER TABLE mcp_servers DISABLE TRIGGER ALL;
ALTER TABLE virtual_model_rules DISABLE TRIGGER ALL;
ALTER TABLE role_virtual_models DISABLE TRIGGER ALL;
ALTER TABLE virtual_models DISABLE TRIGGER ALL;
ALTER TABLE pricing_tiers DISABLE TRIGGER ALL;
ALTER TABLE model_versions DISABLE TRIGGER ALL;
ALTER TABLE role_models DISABLE TRIGGER ALL;
ALTER TABLE models DISABLE TRIGGER ALL;
ALTER TABLE prompt_deployments DISABLE TRIGGER ALL;
ALTER TABLE prompt_versions DISABLE TRIGGER ALL;
ALTER TABLE role_prompt_registries DISABLE TRIGGER ALL;
ALTER TABLE prompt_registries DISABLE TRIGGER ALL;
ALTER TABLE role_guardrails DISABLE TRIGGER ALL;
ALTER TABLE guardrail_profiles DISABLE TRIGGER ALL;
ALTER TABLE user_budgets DISABLE TRIGGER ALL;
ALTER TABLE role_budgets DISABLE TRIGGER ALL;
ALTER TABLE budgets DISABLE TRIGGER ALL;
ALTER TABLE role_permissions DISABLE TRIGGER ALL;
ALTER TABLE user_roles DISABLE TRIGGER ALL;
ALTER TABLE roles DISABLE TRIGGER ALL;
ALTER TABLE users DISABLE TRIGGER ALL;
ALTER TABLE organizations DISABLE TRIGGER ALL;
-- ============================================================
-- Reset existing sample data
-- ============================================================
TRUNCATE TABLE
    guardrail_violations,
    budget_consumptions,
    request_logs,
    sessions,
    api_keys,
    mcp_capabilities,
    mcp_tools,
    role_mcps,
    mcp_servers,
    virtual_model_rules,
    role_virtual_models,
    virtual_models,
    pricing_tiers,
    model_versions,
    role_models,
    models,
    prompt_deployments,
    prompt_versions,
    role_prompt_registries,
    prompt_registries,
    role_guardrails,
    guardrail_profiles,
    user_budgets,
    role_budgets,
    budgets,
    role_permissions,
    user_roles,
    roles,
    users,
    organizations
RESTART IDENTITY CASCADE;
-- ============================================================
-- AI Gateway -- Complete Sample Data 02
-- PostgreSQL 16
-- Generated: 2026-06-05
-- Run ai_gateway_schema.sql first. This file truncates existing data before inserting samples
-- ============================================================

-- ============================================================
-- AI Gateway -- Sample Data (Part 1: Tables 1-20)
-- PostgreSQL 16
-- Generated: 2026-06-05
-- ============================================================

-- Run ai_gateway_schema.sql first. This file truncates existing data before inserting samples, then this file, then Part 2

-- ============================================================
-- 1. ORGANIZATIONS (2 rows)
-- ============================================================
INSERT INTO organizations (id, name, slug, tier, created_at, updated_at, is_active, settings, billing_email) VALUES
('a1111111-1111-1111-1111-111111111111', 'Acme Corp', 'acme-corp', 'enterprise', '2025-01-15 08:00:00+00', '2026-06-01 10:30:00+00', true, '{"theme": "dark", "sso_enabled": true, "allowed_domains": ["acme.com"]}', 'billing@acme.com'),
('a2222222-2222-2222-2222-222222222222', 'Beta Labs', 'beta-labs', 'pro', '2025-03-20 14:00:00+00', '2026-05-28 09:15:00+00', true, '{"theme": "light", "sso_enabled": false, "allowed_domains": ["betalabs.io"]}', 'finance@betalabs.io');

-- ============================================================
-- 2. USERS (15 rows)
-- ============================================================
INSERT INTO users (id, org_id, email, name, auth_provider, external_id, last_login_at, is_active) VALUES
-- Acme Corp users
('b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'alice@acme.com', 'Alice Johnson', 'google', 'google_12345', '2026-06-05 08:30:00+00', true),
('b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'bob@acme.com', 'Bob Smith', 'google', 'google_67890', '2026-06-05 07:45:00+00', true),
('b3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'charlie@acme.com', 'Charlie Davis', 'okta', 'okta_54321', '2026-06-04 16:20:00+00', true),
('b6666666-6666-6666-6666-666666666666', 'a1111111-1111-1111-1111-111111111111', 'diana.kim@acme.com', 'Diana Kim', 'okta', 'okta_11111', '2026-06-05 09:00:00+00', true),
('b7777777-7777-7777-7777-777777777777', 'a1111111-1111-1111-1111-111111111111', 'evan.torres@acme.com', 'Evan Torres', 'google', 'google_22222', '2026-06-04 14:15:00+00', true),
('b8888888-8888-8888-8888-888888888888', 'a1111111-1111-1111-1111-111111111111', 'farah.nasution@acme.com', 'Farah Nasution', 'saml', 'saml_33333', '2026-06-03 10:45:00+00', true),
('b9999999-9999-9999-9999-999999999999', 'a1111111-1111-1111-1111-111111111111', 'george.martin@acme.com', 'George Martin', 'google', 'google_44444', '2026-06-05 06:30:00+00', true),
('baaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a1111111-1111-1111-1111-111111111111', 'hana.wijaya@acme.com', 'Hana Wijaya', 'okta', 'okta_55555', '2026-06-02 17:00:00+00', true),
('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'a1111111-1111-1111-1111-111111111111', 'ivan.putra@acme.com', 'Ivan Putra', 'google', 'google_66666', '2026-06-01 09:20:00+00', false),
('bccccccc-cccc-cccc-cccc-cccccccccccc', 'a1111111-1111-1111-1111-111111111111', 'julia.santos@acme.com', 'Julia Santos', 'saml', 'saml_77777', '2026-05-30 15:40:00+00', true),
-- Beta Labs users
('b4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'diana@betalabs.io', 'Diana Prince', 'google', 'google_98765', '2026-06-05 09:00:00+00', true),
('b5555555-5555-5555-5555-555555555555', 'a2222222-2222-2222-2222-222222222222', 'eve@betalabs.io', 'Eve Chen', 'saml', 'saml_11111', '2026-06-03 11:10:00+00', true),
('bddddddd-dddd-dddd-dddd-dddddddddddd', 'a2222222-2222-2222-2222-222222222222', 'frank.liu@betalabs.io', 'Frank Liu', 'google', 'google_88888', '2026-06-04 13:00:00+00', true),
('beeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'a2222222-2222-2222-2222-222222222222', 'grace.park@betalabs.io', 'Grace Park', 'okta', 'okta_99999', '2026-06-05 08:00:00+00', true),
('bfffffff-ffff-ffff-ffff-ffffffffffff', 'a2222222-2222-2222-2222-222222222222', 'henry.zhao@betalabs.io', 'Henry Zhao', 'saml', 'saml_22222', '2026-06-02 12:30:00+00', true);

-- ============================================================
-- 3. ROLES (6 rows)
-- ============================================================
INSERT INTO roles (id, org_id, name, description, scope, is_system, is_active, created_at) VALUES
('c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Org Admin', 'Full organization access', 'org', true, true, '2025-01-15 08:00:00+00'),
('c2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'AI Developer', 'Can use models and deploy prompts', 'project', false, true, '2025-02-01 10:00:00+00'),
('c3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'Viewer', 'Read-only access to analytics', 'org', false, true, '2025-02-15 09:30:00+00'),
('c4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'Org Admin', 'Full organization access', 'org', true, true, '2025-03-20 14:00:00+00'),
('c5555555-5555-5555-5555-555555555555', 'a2222222-2222-2222-2222-222222222222', 'Data Scientist', 'Model experimentation and fine-tuning', 'project', false, true, '2025-04-10 11:00:00+00'),
('c6666666-6666-6666-6666-666666666666', 'a2222222-2222-2222-2222-222222222222', 'Budget Controller', 'Manages budgets and spending limits', 'org', false, true, '2025-05-01 08:00:00+00');

-- ============================================================
-- 4. USER_ROLES (6 rows)
-- ============================================================
INSERT INTO user_roles (id, user_id, role_id, granted_by, granted_at, expires_at, context) VALUES
('d1111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', NULL, '2025-01-15 08:00:00+00', NULL, '{"projects": ["all"]}'),
('d2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'c2222222-2222-2222-2222-222222222222', 'b1111111-1111-1111-1111-111111111111', '2025-02-01 10:00:00+00', NULL, '{"projects": ["proj-001", "proj-002"]}'),
('d3333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'c3333333-3333-3333-3333-333333333333', 'b1111111-1111-1111-1111-111111111111', '2025-02-15 09:30:00+00', '2026-12-31 23:59:59+00', '{"projects": ["proj-001"]}'),
('d4444444-4444-4444-4444-444444444444', 'b4444444-4444-4444-4444-444444444444', 'c4444444-4444-4444-4444-444444444444', NULL, '2025-03-20 14:00:00+00', NULL, '{"projects": ["all"]}'),
('d5555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555', 'c5555555-5555-5555-5555-555555555555', 'b4444444-4444-4444-4444-444444444444', '2025-04-10 11:00:00+00', NULL, '{"projects": ["research-001"]}'),
('d6666666-6666-6666-6666-666666666666', 'b4444444-4444-4444-4444-444444444444', 'c6666666-6666-6666-6666-666666666666', NULL, '2025-05-01 08:00:00+00', NULL, '{"budgets": ["all"]}');

-- ============================================================
-- 5. ROLE_PERMISSIONS (12 rows)
-- ============================================================
INSERT INTO role_permissions (id, role_id, resource, action, condition, is_active) VALUES
('e1111111-1111-1111-1111-111111111111', 'c1111111-1111-1111-1111-111111111111', 'org', 'admin', NULL, true),
('e2222222-2222-2222-2222-222222222222', 'c1111111-1111-1111-1111-111111111111', 'user', 'admin', NULL, true),
('e3333333-3333-3333-3333-333333333333', 'c1111111-1111-1111-1111-111111111111', 'budget', 'admin', NULL, true),
('e4444444-4444-4444-4444-444444444444', 'c2222222-2222-2222-2222-222222222222', 'model', 'execute', 'org_id = current_org', true),
('e5555555-5555-5555-5555-555555555555', 'c2222222-2222-2222-2222-222222222222', 'prompt', 'update', 'org_id = current_org', true),
('e6666666-6666-6666-6666-666666666666', 'c2222222-2222-2222-2222-222222222222', 'virtual_model', 'execute', 'org_id = current_org', true),
('e7777777-7777-7777-7777-777777777777', 'c3333333-3333-3333-3333-333333333333', 'analytics', 'read', NULL, true),
('e8888888-8888-8888-8888-888888888888', 'c3333333-3333-3333-3333-333333333333', 'model', 'read', NULL, true),
('e9999999-9999-9999-9999-999999999999', 'c5555555-5555-5555-5555-555555555555', 'model', 'execute', 'org_id = current_org', true),
('e1010101-1010-1010-1010-101010101010', 'c5555555-5555-5555-5555-555555555555', 'model', 'admin', 'can_fine_tune = true', true),
('e1111111-2222-3333-4444-555555555555', 'c6666666-6666-6666-6666-666666666666', 'budget', 'admin', NULL, true),
('e1212121-2121-2121-2121-212121212121', 'c6666666-6666-6666-6666-666666666666', 'analytics', 'read', NULL, true);

-- ============================================================
-- 6. BUDGETS (4 rows)
-- ============================================================
INSERT INTO budgets (id, org_id, name, total_amount, remaining_amount, currency, period, period_start, period_end, is_active, is_shared) VALUES
('f1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'Q2 2026 Enterprise Budget', 50000.00, 32450.75, 'USD', 'quarterly', '2026-04-01 00:00:00+00', '2026-06-30 23:59:59+00', true, true),
('f2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'Project Alpha Budget', 10000.00, 6780.50, 'USD', 'monthly', '2026-06-01 00:00:00+00', '2026-06-30 23:59:59+00', true, false),
('f3333333-3333-3333-3333-333333333333', 'a2222222-2222-2222-2222-222222222222', 'Beta Labs Annual Budget', 25000.00, 18900.00, 'USD', 'annual', '2026-01-01 00:00:00+00', '2026-12-31 23:59:59+00', true, true),
('f4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'Research Team Budget', 5000.00, 3200.00, 'USD', 'monthly', '2026-06-01 00:00:00+00', '2026-06-30 23:59:59+00', true, false);

-- ============================================================
-- 7. ROLE_BUDGETS (5 rows)
-- ============================================================
INSERT INTO role_budgets (id, role_id, budget_id, max_budget_per_user, max_budget_per_request, spend_scope, can_override) VALUES
('9b25892f-3f98-7456-2a67-a362e8e160c3', 'c1111111-1111-1111-1111-111111111111', 'f1111111-1111-1111-1111-111111111111', 10000.00, 500.00, 'org', true),
('300e4d65-57c0-cf07-8328-23b4dd3d94f6', 'c2222222-2222-2222-2222-222222222222', 'f1111111-1111-1111-1111-111111111111', 2000.00, 100.00, 'team', false),
('040c71d0-90f4-d630-34e0-97de20867af6', 'c2222222-2222-2222-2222-222222222222', 'f2222222-2222-2222-2222-222222222222', 1500.00, 75.00, 'own', false),
('5aec5cd6-9412-748a-cfb6-5efb1df769c3', 'c5555555-5555-5555-5555-555555555555', 'f3333333-3333-3333-3333-333333333333', 3000.00, 200.00, 'team', false),
('235bd797-1e61-98e3-53e9-1d76c103f3b1', 'c6666666-6666-6666-6666-666666666666', 'f3333333-3333-3333-3333-333333333333', 5000.00, 1000.00, 'org', true);

-- ============================================================
-- 8. USER_BUDGETS (5 rows)
-- ============================================================
INSERT INTO user_budgets (id, user_id, role_budget_id, budget_id, allocated_amount, consumed_amount, remaining_amount, status, allocated_at, reset_at) VALUES
('ff46d7e3-2d9a-b3d2-5433-d856a49a915c', 'b1111111-1111-1111-1111-111111111111', '9b25892f-3f98-7456-2a67-a362e8e160c3', 'f1111111-1111-1111-1111-111111111111', 10000.00, 4250.50, 5749.50, 'active', '2026-04-01 00:00:00+00', '2026-07-01 00:00:00+00'),
('d70f2341-79fe-c8ca-a3dd-9ad7a2a41d8a', 'b2222222-2222-2222-2222-222222222222', '300e4d65-57c0-cf07-8328-23b4dd3d94f6', 'f1111111-1111-1111-1111-111111111111', 2000.00, 1890.25, 109.75, 'active', '2026-04-01 00:00:00+00', '2026-07-01 00:00:00+00'),
('c9c0c875-4336-47a4-d83e-05437508e9ff', 'b2222222-2222-2222-2222-222222222222', '040c71d0-90f4-d630-34e0-97de20867af6', 'f2222222-2222-2222-2222-222222222222', 1500.00, 450.00, 1050.00, 'active', '2026-06-01 00:00:00+00', '2026-07-01 00:00:00+00'),
('216088f4-ca85-36a5-1d02-ff8088f1b4ee', 'b5555555-5555-5555-5555-555555555555', '5aec5cd6-9412-748a-cfb6-5efb1df769c3', 'f3333333-3333-3333-3333-333333333333', 3000.00, 1200.00, 1800.00, 'active', '2026-01-01 00:00:00+00', '2027-01-01 00:00:00+00'),
('a28943cf-9d87-1fe1-44a7-ecc254b9b02b', 'b4444444-4444-4444-4444-444444444444', '235bd797-1e61-98e3-53e9-1d76c103f3b1', 'f3333333-3333-3333-3333-333333333333', 5000.00, 2100.00, 2900.00, 'active', '2026-01-01 00:00:00+00', '2027-01-01 00:00:00+00');

-- ============================================================
-- 9. GUARDRAIL_PROFILES (4 rows)
-- ============================================================
INSERT INTO guardrail_profiles (id, org_id, name, description, is_default, content_policy, pii_rules, topic_filters, rate_limits, custom_rules, is_active, created_at) VALUES
('3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'a1111111-1111-1111-1111-111111111111', 'Enterprise Strict', 'Maximum security for enterprise use', true, 
 '[{"type": "hate_speech", "action": "block", "threshold": 0.1}, {"type": "harassment", "action": "block", "threshold": 0.1}]',
 '[{"type": "ssn", "action": "mask"}, {"type": "email", "action": "mask"}, {"type": "credit_card", "action": "block"}]',
 '[{"topic": "politics", "action": "warn"}, {"topic": "medical_advice", "action": "block"}]',
 '{"requests_per_minute": 60, "tokens_per_hour": 100000}',
 '[{"name": "no_code_execution", "pattern": "exec\\(|eval\\(", "action": "block"}]',
 true, '2025-01-15 08:00:00+00'),

('a16b2e24-0104-5025-d4f7-5c8c59a1ac75', 'a1111111-1111-1111-1111-111111111111', 'Developer Friendly', 'Balanced for development teams', false,
 '[{"type": "hate_speech", "action": "warn", "threshold": 0.3}]',
 '[{"type": "ssn", "action": "mask"}]',
 '[{"topic": "politics", "action": "log"}]',
 '{"requests_per_minute": 120, "tokens_per_hour": 500000}',
 '[]',
 true, '2025-03-01 10:00:00+00'),

('37ef5ffa-2e48-42d1-5f03-d5141b36abc9', 'a2222222-2222-2222-2222-222222222222', 'Research Standard', 'Standard guardrails for research', true,
 '[{"type": "hate_speech", "action": "block", "threshold": 0.2}, {"type": "self_harm", "action": "block", "threshold": 0.05}]',
 '[{"type": "ssn", "action": "mask"}, {"type": "phone", "action": "mask"}]',
 '[]',
 '{"requests_per_minute": 200, "tokens_per_hour": 1000000}',
 '[{"name": "data_exfiltration", "pattern": "\\b[A-Z]{2,}\\d{6,}\\b", "action": "warn"}]',
 true, '2025-03-20 14:00:00+00'),

('c92e649f-0c94-be0e-2fa7-8644ed5bb74d', 'a2222222-2222-2222-2222-222222222222', 'Minimal Monitoring', 'Light-touch for internal tools', false,
 '[{"type": "hate_speech", "action": "log", "threshold": 0.5}]',
 '[]',
 '[]',
 '{"requests_per_minute": 500, "tokens_per_hour": 5000000}',
 '[]',
 true, '2025-06-01 09:00:00+00');

-- ============================================================
-- 10. ROLE_GUARDRAILS (5 rows)
-- ============================================================
INSERT INTO role_guardrails (id, role_id, guardrail_profile_id, is_mandatory, can_bypass, bypass_approval) VALUES
('fc60e32f-d99a-5b74-f28b-7380dee754bd', 'c1111111-1111-1111-1111-111111111111', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', true, false, NULL),
('75bc957e-acbb-a7d0-2cbd-8cd89154da4a', 'c2222222-2222-2222-2222-222222222222', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', true, true, 'admin'),
('99851cef-0ec6-e110-77d6-ff3cd6832e68', 'c3333333-3333-3333-3333-333333333333', 'a16b2e24-0104-5025-d4f7-5c8c59a1ac75', true, false, NULL),
('72ab4f36-7770-dc95-8e18-6ab509a27420', 'c5555555-5555-5555-5555-555555555555', '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', true, true, 'manager'),
('8f7d8cf2-06e4-9329-e54e-cbfde47029ab', 'c6666666-6666-6666-6666-666666666666', '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', false, true, 'admin');

-- ============================================================
-- 11. PROMPT_REGISTRIES (5 rows)
-- ============================================================
INSERT INTO prompt_registries (id, org_id, name, slug, description, visibility, category, tags, is_active, created_at) VALUES
('33959841-7338-bab5-f727-d9759cecd8da', 'a1111111-1111-1111-1111-111111111111', 'Customer Support Prompts', 'customer-support-prompts', 'Prompts for customer support chatbot', 'team', 'support', '["chatbot", "support", "customer-service"]', true, '2025-02-10 09:00:00+00'),
('ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', 'a1111111-1111-1111-1111-111111111111', 'Code Review Templates', 'code-review-templates', 'Prompts for automated code review', 'org', 'engineering', '["code-review", "engineering", "quality"]', true, '2025-03-15 11:30:00+00'),
('e24825a3-031b-6e81-1478-1ae9a2a930c3', 'a1111111-1111-1111-1111-111111111111', 'Marketing Copy Generator', 'marketing-copy-generator', 'Prompts for marketing content creation', 'private', 'marketing', '["marketing", "content", "copywriting"]', true, '2025-04-20 14:00:00+00'),
('2f2e1508-f4af-5f81-0344-4e685f5306f1', 'a2222222-2222-2222-2222-222222222222', 'Research Analysis', 'research-analysis', 'Prompts for data analysis and research', 'team', 'research', '["research", "analysis", "data"]', true, '2025-05-10 10:00:00+00'),
('5adcf9bb-3a1a-3c84-59c3-cda4f1f19685', 'a2222222-2222-2222-2222-222222222222', 'Internal Documentation', 'internal-documentation', 'Prompts for doc generation', 'org', 'documentation', '["docs", "internal", "knowledge-base"]', true, '2025-06-01 08:00:00+00');

-- ============================================================
-- 12. ROLE_PROMPT_REGISTRIES (6 rows)
-- ============================================================
INSERT INTO role_prompt_registries (id, role_id, prompt_registry_id, access_level, can_fork, can_deploy) VALUES
('2545a9d6-0233-badd-aa43-0b32ff988e7f', 'c1111111-1111-1111-1111-111111111111', '33959841-7338-bab5-f727-d9759cecd8da', 'admin', true, true),
('63c688a5-477f-0784-f1ce-4c6d06f5c90c', 'c2222222-2222-2222-2222-222222222222', '33959841-7338-bab5-f727-d9759cecd8da', 'execute', false, false),
('c5e4140f-e0f9-8761-f2f1-9a210da602f0', 'c2222222-2222-2222-2222-222222222222', 'ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', 'write', true, true),
('1e4a759c-aa61-e5b5-58d2-e40ff84a74f0', 'c3333333-3333-3333-3333-333333333333', 'ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', 'read', false, false),
('7882f6c9-05b2-e45e-f21a-1b99f8e04707', 'c5555555-5555-5555-5555-555555555555', '2f2e1508-f4af-5f81-0344-4e685f5306f1', 'admin', true, true),
('a68d40ce-a5e3-e7d5-4d49-24e88de9f9fb', 'c4444444-4444-4444-4444-444444444444', '5adcf9bb-3a1a-3c84-59c3-cda4f1f19685', 'admin', true, true);

-- ============================================================
-- 13. PROMPT_VERSIONS (8 rows)
-- ============================================================
INSERT INTO prompt_versions (id, registry_id, author_id, version_number, prompt_template, variables, metadata, status, created_at) VALUES
('42b941a1-a3f0-d8f3-20fd-4101581ffae0', '33959841-7338-bab5-f727-d9759cecd8da', 'b1111111-1111-1111-1111-111111111111', 1, 
 'You are a helpful customer support agent. Customer issue: {{issue}}. Provide a professional response.',
 '[{"name": "issue", "type": "string", "required": true}]',
 '{"temperature": 0.7, "max_tokens": 500}',
 'published', '2025-02-10 09:00:00+00'),

('b403bbf9-41e3-ad1a-efa8-107725c43fb4', '33959841-7338-bab5-f727-d9759cecd8da', 'b1111111-1111-1111-1111-111111111111', 2,
 'You are a senior customer support agent. Customer issue: {{issue}}. Previous context: {{context}}. Provide an empathetic and solution-oriented response.',
 '[{"name": "issue", "type": "string", "required": true}, {"name": "context", "type": "string", "required": false}]',
 '{"temperature": 0.5, "max_tokens": 800, "model": "gpt-4"}',
 'published', '2025-04-15 10:00:00+00'),

('e2d3e747-cdc9-074d-c366-5a2c19c70107', 'ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', 'b2222222-2222-2222-2222-222222222222', 1,
 'Review the following code for bugs, security issues, and style violations. Code: {{code}}. Language: {{language}}.',
 '[{"name": "code", "type": "string", "required": true}, {"name": "language", "type": "string", "required": true}]',
 '{"temperature": 0.2, "max_tokens": 2000}',
 'published', '2025-03-15 11:30:00+00'),

('61affef3-5432-baf1-e392-ad6e64701d93', 'ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', 'b2222222-2222-2222-2222-222222222222', 2,
 'Perform a comprehensive code review. Code: {{code}}. Language: {{language}}. Focus areas: {{focus_areas}}. Include security analysis.',
 '[{"name": "code", "type": "string", "required": true}, {"name": "language", "type": "string", "required": true}, {"name": "focus_areas", "type": "array", "required": false}]',
 '{"temperature": 0.1, "max_tokens": 3000, "tools": ["security_scanner"]}',
 'draft', '2025-06-01 14:00:00+00'),

('b725493b-bd27-4dac-5d7e-6d909a2e121b', 'e24825a3-031b-6e81-1478-1ae9a2a930c3', 'b3333333-3333-3333-3333-333333333333', 1,
 'Generate marketing copy for product: {{product_name}}. Target audience: {{audience}}. Tone: {{tone}}. Include call-to-action.',
 '[{"name": "product_name", "type": "string", "required": true}, {"name": "audience", "type": "string", "required": true}, {"name": "tone", "type": "string", "required": true}]',
 '{"temperature": 0.8, "max_tokens": 600}',
 'published', '2025-04-20 14:00:00+00'),

('f14f1fa9-5e9c-4e59-733f-49574435c6e5', '2f2e1508-f4af-5f81-0344-4e685f5306f1', 'b5555555-5555-5555-5555-555555555555', 1,
 'Analyze the following dataset and provide statistical insights. Data: {{data}}. Analysis type: {{analysis_type}}.',
 '[{"name": "data", "type": "string", "required": true}, {"name": "analysis_type", "type": "string", "required": true}]',
 '{"temperature": 0.3, "max_tokens": 1500, "tools": ["python_interpreter"]}',
 'published', '2025-05-10 10:00:00+00'),

('e506c857-c011-fc0d-8f8c-0b599dffe096', '2f2e1508-f4af-5f81-0344-4e685f5306f1', 'b5555555-5555-5555-5555-555555555555', 2,
 'Advanced statistical analysis with visualizations. Data: {{data}}. Hypothesis: {{hypothesis}}. Method: {{method}}.',
 '[{"name": "data", "type": "string", "required": true}, {"name": "hypothesis", "type": "string", "required": false}, {"name": "method", "type": "string", "required": false}]',
 '{"temperature": 0.2, "max_tokens": 2500, "tools": ["python_interpreter", "chart_generator"]}',
 'draft', '2025-06-04 09:00:00+00'),

('26bebbce-f5d1-01c5-2403-a11ccf7de7fb', '5adcf9bb-3a1a-3c84-59c3-cda4f1f19685', 'b4444444-4444-4444-4444-444444444444', 1,
 'Generate technical documentation for API endpoint. Endpoint: {{endpoint}}. Method: {{method}}. Include examples.',
 '[{"name": "endpoint", "type": "string", "required": true}, {"name": "method", "type": "string", "required": true}]',
 '{"temperature": 0.4, "max_tokens": 1200}',
 'published', '2025-06-01 08:00:00+00');

-- ============================================================
-- 14. PROMPT_DEPLOYMENTS (4 rows)
-- ============================================================
INSERT INTO prompt_deployments (id, version_id, deployed_by, endpoint_alias, runtime_config, is_active, deployed_at) VALUES
('8f4f2fa8-d38a-59a8-87fd-745b9961a182', 'b403bbf9-41e3-ad1a-efa8-107725c43fb4', 'b1111111-1111-1111-1111-111111111111', 'support-chat-v2', '{"temperature": 0.5, "max_tokens": 800, "streaming": true}', true, '2025-04-20 10:00:00+00'),
('aa4dfbbc-62a3-0248-0429-d7c8051e2600', 'e2d3e747-cdc9-074d-c366-5a2c19c70107', 'b2222222-2222-2222-2222-222222222222', 'code-review-v1', '{"temperature": 0.2, "max_tokens": 2000}', true, '2025-03-20 12:00:00+00'),
('3194957e-b9e7-1284-211e-b24ec4947f5b', 'b725493b-bd27-4dac-5d7e-6d909a2e121b', 'b3333333-3333-3333-3333-333333333333', 'marketing-copy-v1', '{"temperature": 0.8, "max_tokens": 600}', true, '2025-05-01 09:00:00+00'),
('f81e9862-9710-8ea9-17ad-b88f2c92ba90', 'f14f1fa9-5e9c-4e59-733f-49574435c6e5', 'b5555555-5555-5555-5555-555555555555', 'research-analysis-v1', '{"temperature": 0.3, "max_tokens": 1500, "tools": ["python_interpreter"]}', true, '2025-05-15 11:00:00+00');

-- ============================================================
-- 15. MODELS (8 rows)
-- ============================================================
INSERT INTO models (id, org_id, provider_id, model_id, name, modality, capabilities, max_tokens, is_active, created_at) VALUES
('c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'a1111111-1111-1111-1111-111111111111', '11111111-0000-4000-8000-000000000001', 'gpt-4o', 'GPT-4o', 'multimodal', '["reasoning", "vision", "json_mode", "function_calling", "streaming"]', 128000, true, '2024-05-01 00:00:00+00'),
('8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'a1111111-1111-1111-1111-111111111111', '11111111-0000-4000-8000-000000000001', 'gpt-4o-mini', 'GPT-4o Mini', 'multimodal', '["reasoning", "vision", "json_mode", "function_calling", "streaming"]', 128000, true, '2024-07-01 00:00:00+00'),
('41551ad7-8d38-1c8e-69ee-32765ec6b51f', 'a1111111-1111-1111-1111-111111111111', '22222222-0000-4000-8000-000000000001', 'claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'multimodal', '["reasoning", "vision", "json_mode", "streaming", "tool_use"]', 200000, true, '2024-10-01 00:00:00+00'),
('7652e905-d3c6-8349-2cf9-f514a40d8ff9', 'a1111111-1111-1111-1111-111111111111', '22222222-0000-4000-8000-000000000001', 'claude-3-opus-20240229', 'Claude 3 Opus', 'text', '["reasoning", "json_mode", "streaming", "tool_use"]', 200000, true, '2024-03-01 00:00:00+00'),
('78259241-148b-39d6-217c-25c2bfcb8ba7', 'a2222222-2222-2222-2222-222222222222', '11111111-0000-4000-8000-000000000001', 'beta-gpt-4o', 'GPT-4o', 'multimodal', '["reasoning", "vision", "json_mode", "function_calling", "streaming"]', 128000, true, '2024-05-01 00:00:00+00'),
('79d3285a-6d36-04c8-5389-4a30d3791175', 'a2222222-2222-2222-2222-222222222222', '33333333-0000-4000-8000-000000000001', 'gemini-1.5-pro', 'Gemini 1.5 Pro', 'multimodal', '["reasoning", "vision", "json_mode", "streaming", "long_context"]', 1000000, true, '2024-06-01 00:00:00+00'),
('eb7608f0-f2dc-e6fe-c32f-7e36262d5c37', 'a2222222-2222-2222-2222-222222222222', '22222222-0000-4000-8000-000000000001', 'beta-claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'multimodal', '["reasoning", "vision", "json_mode", "streaming", "tool_use"]', 200000, true, '2024-10-01 00:00:00+00'),
('d73e63e4-47eb-acb5-792f-38bd1e7cf5a9', 'a2222222-2222-2222-2222-222222222222', '44444444-0000-4000-8000-000000000001', 'mistral-large-latest', 'Mistral Large', 'text', '["reasoning", "json_mode", "streaming"]', 128000, true, '2024-08-01 00:00:00+00');

-- ============================================================
-- 16. ROLE_MODELS (8 rows)
-- ============================================================
INSERT INTO role_models (id, role_id, model_id, access_level, can_fine_tune, max_quota_per_request) VALUES
('d8d50bdc-997d-f1ec-abf3-3e13e8b0a56e', 'c1111111-1111-1111-1111-111111111111', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'admin', true, NULL),
('d5b28dae-c7f5-736e-d56c-30096bb2e092', 'c1111111-1111-1111-1111-111111111111', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'admin', true, NULL),
('0ab5ec04-9498-3421-37b6-f71804fd96fa', 'c2222222-2222-2222-2222-222222222222', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'execute', false, 500.00),
('0dd2f135-ea05-c312-0b46-786faed779c1', 'c2222222-2222-2222-2222-222222222222', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'execute', false, 100.00),
('84869f38-22a4-62be-dc55-7b9dd03cfd07', 'c3333333-3333-3333-3333-333333333333', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'read', false, NULL),
('9c8be71d-3cd0-9275-cef1-3d95c9cb18cd', 'c5555555-5555-5555-5555-555555555555', '78259241-148b-39d6-217c-25c2bfcb8ba7', 'execute', true, 1000.00),
('bbd6254e-c0bd-6316-85f5-7d7df5fa7373', 'c5555555-5555-5555-5555-555555555555', '79d3285a-6d36-04c8-5389-4a30d3791175', 'execute', false, 800.00),
('7e86ed8e-1e9e-1f62-7f2c-473867c56848', 'c4444444-4444-4444-4444-444444444444', '78259241-148b-39d6-217c-25c2bfcb8ba7', 'admin', true, NULL);

-- ============================================================
-- 17. MODEL_VERSIONS (6 rows)
-- ============================================================
INSERT INTO model_versions (id, model_id, version, deployment_status, config, released_at) VALUES
('1b160423-cfb5-09fa-743e-59ad36a1ca1c', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', '2024-05-13', 'production', '{"context_window": 128000, "training_cutoff": "2023-10", "knowledge_cutoff": "2023-10"}', '2024-05-13 00:00:00+00'),
('ab8c16ad-793e-8316-9d9b-06d26d2ae585', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', '2024-07-18', 'production', '{"context_window": 128000, "training_cutoff": "2023-10", "knowledge_cutoff": "2023-10"}', '2024-07-18 00:00:00+00'),
('e49071f6-ef3b-1bfb-38aa-01f67929591a', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', '20241022', 'production', '{"context_window": 200000, "training_cutoff": "2024-04", "knowledge_cutoff": "2024-04"}', '2024-10-22 00:00:00+00'),
('fc9516b2-6046-9407-c1d0-e92d5e305753', '7652e905-d3c6-8349-2cf9-f514a40d8ff9', '20240229', 'production', '{"context_window": 200000, "training_cutoff": "2023-08", "knowledge_cutoff": "2023-08"}', '2024-02-29 00:00:00+00'),
('586ae205-9ad1-d94b-99a6-84e11663be06', '79d3285a-6d36-04c8-5389-4a30d3791175', '001', 'production', '{"context_window": 1000000, "training_cutoff": "2024-05", "multimodal": true}', '2024-06-01 00:00:00+00'),
('b7bc080c-c398-76ea-8106-70d6747dbf5d', 'd73e63e4-47eb-acb5-792f-38bd1e7cf5a9', 'latest', 'production', '{"context_window": 128000, "training_cutoff": "2024-01"}', '2024-08-01 00:00:00+00');

-- ============================================================
-- 18. PRICING_TIERS (10 rows)
-- ============================================================
INSERT INTO pricing_tiers (id, model_id, tier_name, input_price, output_price, cached_price, currency, effective_from, effective_to) VALUES
('06ae6bc0-c644-7225-0003-b34e3e0e52e9', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'standard', 0.005000, 0.015000, 0.001250, 'USD', '2024-05-13 00:00:00+00', NULL),
('ef2fc604-4de7-e7ed-0d2e-923515f9e746', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'standard', 0.000150, 0.000600, 0.000075, 'USD', '2024-07-18 00:00:00+00', NULL),
('35d1a064-387e-7962-7d32-c33b8247df2b', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', 'standard', 0.003000, 0.015000, 0.000000, 'USD', '2024-10-22 00:00:00+00', NULL),
('2b6f1fc4-682d-0024-2ac2-36b5cc676049', '7652e905-d3c6-8349-2cf9-f514a40d8ff9', 'standard', 0.015000, 0.075000, 0.000000, 'USD', '2024-03-01 00:00:00+00', NULL),
('dab3852d-5ffb-3ba6-6220-5e5fd0bdfa08', '78259241-148b-39d6-217c-25c2bfcb8ba7', 'standard', 0.005000, 0.015000, 0.001250, 'USD', '2024-05-13 00:00:00+00', NULL),
('da7423a7-2d35-3c4b-147e-385de026134b', '79d3285a-6d36-04c8-5389-4a30d3791175', 'standard', 0.003500, 0.010500, 0.000875, 'USD', '2024-06-01 00:00:00+00', NULL),
('181369ff-03db-131d-6d6c-b24c092d774b', 'eb7608f0-f2dc-e6fe-c32f-7e36262d5c37', 'standard', 0.003000, 0.015000, 0.000000, 'USD', '2024-10-22 00:00:00+00', NULL),
('6694979a-a880-31d1-140a-3442ea3dd002', 'd73e63e4-47eb-acb5-792f-38bd1e7cf5a9', 'standard', 0.002000, 0.006000, 0.000000, 'USD', '2024-08-01 00:00:00+00', NULL),
('65731577-b753-f0e6-b65c-150f4c45aff4', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'batch', 0.002500, 0.007500, 0.000625, 'USD', '2024-08-01 00:00:00+00', NULL),
('2c297caf-afbe-11f4-02cc-f20ef2f17de9', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', 'batch', 0.001500, 0.007500, 0.000000, 'USD', '2024-11-01 00:00:00+00', NULL);

-- ============================================================
-- 19. VIRTUAL_MODELS (4 rows)
-- ============================================================
INSERT INTO virtual_models (id, org_id, name, slug, description, default_model_id, is_active, created_at) VALUES
('fd5b6123-229f-d20f-a811-41ddb843a72f', 'a1111111-1111-1111-1111-111111111111', 'Smart Router', 'smart-router', 'Automatically selects best model based on request parameters', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', true, '2025-05-01 10:00:00+00'),
('f93c7053-440b-5b37-7a67-df6cba0bfdd8', 'a1111111-1111-1111-1111-111111111111', 'Code Assistant', 'code-assistant', 'Optimized for code generation and review tasks', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', true, '2025-05-15 09:00:00+00'),
('8edf9a64-a926-99d2-af63-6c02007fcfc2', 'a2222222-2222-2222-2222-222222222222', 'Research Optimizer', 'research-optimizer', 'Routes to models best suited for research analysis', '79d3285a-6d36-04c8-5389-4a30d3791175', true, '2025-06-01 08:00:00+00'),
('4f8f8f5d-f129-2086-9b0d-36c31890324d', 'a2222222-2222-2222-2222-222222222222', 'Cost Saver', 'cost-saver', 'Prioritizes cost-effective models for general tasks', 'd73e63e4-47eb-acb5-792f-38bd1e7cf5a9', true, '2025-06-10 11:00:00+00');

-- ============================================================
-- 20. ROLE_VIRTUAL_MODELS (4 rows)
-- ============================================================
INSERT INTO role_virtual_models (id, role_id, virtual_model_id, access_level, can_modify_routing) VALUES
('0697f708-486a-924d-7744-f7ee79570bf8', 'c1111111-1111-1111-1111-111111111111', 'fd5b6123-229f-d20f-a811-41ddb843a72f', 'admin', true),
('3112804c-8ea0-7e8c-251b-ab6ad10b891a', 'c2222222-2222-2222-2222-222222222222', 'fd5b6123-229f-d20f-a811-41ddb843a72f', 'execute', false),
('31cb7760-62d9-b103-fff7-2b02b2df42b2', 'c2222222-2222-2222-2222-222222222222', 'f93c7053-440b-5b37-7a67-df6cba0bfdd8', 'execute', false),
('eaaaf559-4d2b-6f18-d876-bc393ff9a1bc', 'c5555555-5555-5555-5555-555555555555', '8edf9a64-a926-99d2-af63-6c02007fcfc2', 'execute', true);


-- ============================================================
-- AI Gateway -- Sample Data (Part 2: Tables 21-30)
-- PostgreSQL 16
-- Generated: 2026-06-05
-- ============================================================

-- Run ai_gateway_schema.sql and ai_gateway_sample_data_part1.sql first

-- ============================================================
-- 21. VIRTUAL_MODEL_RULES (13 rows)
-- ============================================================
INSERT INTO virtual_model_rules (id, virtual_model_id, target_model_id, priority, rule_type, condition, parameters, is_active, created_at) VALUES
('b03aee3f-806d-19ac-15ff-a531ceffbb61', 'fd5b6123-229f-d20f-a811-41ddb843a72f', '7652e905-d3c6-8349-2cf9-f514a40d8ff9', 1, 'quality',
 '{"operator": ">=", "threshold": 0.9, "metric": "quality_score"}',
 '{"min_quality_score": 0.9, "rationale": "High-stakes reasoning tasks"}', true, '2025-05-01 10:00:00+00'),

('d99bc062-fd10-2517-6f6b-a0ea208e81ad', 'fd5b6123-229f-d20f-a811-41ddb843a72f', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', 2, 'request_type',
 '{"in": ["code_chat", "code_review", "debugging"]}',
 '{"types": ["code_chat", "code_review", "debugging"], "rationale": "Code tasks prefer Claude"}', true, '2025-05-01 10:00:00+00'),

('1894617d-c7b1-f0ff-a5b1-c2c669e32d9d', 'fd5b6123-229f-d20f-a811-41ddb843a72f', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 3, 'token',
 '{"operator": ">", "threshold": 64000, "metric": "estimated_input_tokens"}',
 '{"max_input_tokens": 128000, "rationale": "Long context needs GPT-4o"}', true, '2025-05-01 10:00:00+00'),

('6f84e822-a8f3-deff-0d5c-f25aea6ca2c0', 'fd5b6123-229f-d20f-a811-41ddb843a72f', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 4, 'price',
 '{"operator": "<", "threshold": 0.001, "metric": "max_price_per_1k"}',
 '{"max_price_per_1k": 0.001, "rationale": "Budget-conscious requests"}', true, '2025-05-01 10:00:00+00'),

('69411a4b-b633-2c48-e259-45b5db8ad5f3', 'fd5b6123-229f-d20f-a811-41ddb843a72f', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 5, 'fallback',
 '{"on_error": true, "on_timeout": true}',
 '{"fallback_model_id": "8c267361-5f78-8836-4b4c-8e1a3651c5ad", "retry_count": 2, "timeout_ms": 30000}', true, '2025-05-01 10:00:00+00'),

('ae845d79-1aa2-851a-457c-a3562be8a9dd', 'f93c7053-440b-5b37-7a67-df6cba0bfdd8', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', 1, 'request_type',
 '{"in": ["code_chat", "code_review", "debugging", "refactoring"]}',
 '{"types": ["code_chat", "code_review", "debugging", "refactoring"], "rationale": "Code tasks"}', true, '2025-05-15 09:00:00+00'),

('f5be78dc-6113-ebf3-d083-bd1193de9610', 'f93c7053-440b-5b37-7a67-df6cba0bfdd8', '7652e905-d3c6-8349-2cf9-f514a40d8ff9', 2, 'quality',
 '{"operator": ">=", "threshold": 0.95, "metric": "quality_score"}',
 '{"min_quality_score": 0.95, "rationale": "Complex architecture tasks"}', true, '2025-05-15 09:00:00+00'),

('812629b4-8f60-aaf3-9f82-11bb08d779e3', 'f93c7053-440b-5b37-7a67-df6cba0bfdd8', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 3, 'fallback',
 '{"on_error": true, "on_timeout": true}',
 '{"fallback_model_id": "41551ad7-8d38-1c8e-69ee-32765ec6b51f", "retry_count": 1, "timeout_ms": 45000}', true, '2025-05-15 09:00:00+00'),

('7a8c6263-d8bc-2eab-e5e3-7a546dc3a3c4', '8edf9a64-a926-99d2-af63-6c02007fcfc2', '79d3285a-6d36-04c8-5389-4a30d3791175', 1, 'token',
 '{"operator": ">", "threshold": 100000, "metric": "estimated_input_tokens"}',
 '{"max_input_tokens": 1000000, "rationale": "Long documents need Gemini"}', true, '2025-06-01 08:00:00+00'),

('094f7350-8139-e083-2ee6-cabd5c8b46a1', '8edf9a64-a926-99d2-af63-6c02007fcfc2', 'eb7608f0-f2dc-e6fe-c32f-7e36262d5c37', 2, 'request_type',
 '{"in": ["analysis", "summarization", "extraction"]}',
 '{"types": ["analysis", "summarization", "extraction"], "rationale": "Research tasks"}', true, '2025-06-01 08:00:00+00'),

('eee286ad-51f6-3abd-5873-483991586db9', '8edf9a64-a926-99d2-af63-6c02007fcfc2', '78259241-148b-39d6-217c-25c2bfcb8ba7', 3, 'fallback',
 '{"on_error": true}',
 '{"fallback_model_id": "eb7608f0-f2dc-e6fe-c32f-7e36262d5c37", "retry_count": 2}', true, '2025-06-01 08:00:00+00'),

('1a4e71fc-0d45-c41e-5b66-9725e5a7d471', '4f8f8f5d-f129-2086-9b0d-36c31890324d', 'd73e63e4-47eb-acb5-792f-38bd1e7cf5a9', 1, 'price',
 '{"operator": "<", "threshold": 0.003, "metric": "max_price_per_1k"}',
 '{"max_price_per_1k": 0.003, "rationale": "Always prefer cheapest"}', true, '2025-06-10 11:00:00+00'),

('53872684-9efa-0da4-27d7-54bb2d9a769b', '4f8f8f5d-f129-2086-9b0d-36c31890324d', '78259241-148b-39d6-217c-25c2bfcb8ba7', 2, 'fallback',
 '{"on_error": true, "on_timeout": true}',
 '{"fallback_model_id": "d73e63e4-47eb-acb5-792f-38bd1e7cf5a9", "retry_count": 1}', true, '2025-06-10 11:00:00+00');

-- ============================================================
-- 22. MCP_SERVERS (4 rows)
-- ============================================================
INSERT INTO mcp_servers (id, org_id, name, slug, transport, endpoint_url, auth_config, status, is_active, created_at) VALUES
('b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'a1111111-1111-1111-1111-111111111111', 'GitHub Integration', 'github-integration', 'http', 'https://api.github.com/mcp', '{"type": "token", "header": "Authorization", "prefix": "token "}', 'active', true, '2025-04-01 10:00:00+00'),
('9ca4f324-93d3-73af-31b0-69f382a00d6f', 'a1111111-1111-1111-1111-111111111111', 'Jira Connector', 'jira-connector', 'http', 'https://acme.atlassian.net/mcp', '{"type": "basic", "username_env": "JIRA_USER", "password_env": "JIRA_TOKEN"}', 'active', true, '2025-04-15 11:00:00+00'),
('cba99450-f368-2697-25ba-d7927168746a', 'a2222222-2222-2222-2222-222222222222', 'Slack Bot', 'slack-bot', 'sse', 'https://slack.com/api/mcp/events', '{"type": "bearer", "token_env": "SLACK_BOT_TOKEN"}', 'active', true, '2025-05-20 09:00:00+00'),
('0f83fe75-ac60-767f-427d-c23bdbb27593', 'a2222222-2222-2222-2222-222222222222', 'Database Query Tool', 'db-query-tool', 'stdio', NULL, '{"type": "local", "command": "python -m db_mcp_server", "env": {"DB_URL": "postgresql://localhost/research"}}', 'active', true, '2025-06-01 08:00:00+00');

-- ============================================================
-- 23. ROLE_MCPS (5 rows)
-- ============================================================
INSERT INTO role_mcps (id, role_id, mcp_server_id, access_level, can_configure, allowed_tools, allowed_resources) VALUES
('faf01593-712b-2398-f119-464d1585b64b', 'c1111111-1111-1111-1111-111111111111', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'admin', true, '[]', '[]'),
('099cd3f6-5d3e-57f1-33d3-aacdad44155c', 'c2222222-2222-2222-2222-222222222222', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'execute', false, '["search_repos", "get_file_contents"]', '[]'),
('90e9bef3-1955-ce25-fdf5-b4078558fc36', 'c2222222-2222-2222-2222-222222222222', '9ca4f324-93d3-73af-31b0-69f382a00d6f', 'execute', false, '["create_ticket", "search_issues"]', '[]'),
('d55d0cfc-d568-b364-0251-2ffcb587637d', 'c5555555-5555-5555-5555-555555555555', 'cba99450-f368-2697-25ba-d7927168746a', 'execute', false, '["send_message", "search_messages"]', '[]'),
('951ef575-b8ee-6556-d832-c786ffadea13', 'c5555555-5555-5555-5555-555555555555', '0f83fe75-ac60-767f-427d-c23bdbb27593', 'execute', false, '["execute_query", "get_schema"]', '["db://research/public/*"]');

-- ============================================================
-- 24. MCP_TOOLS (8 rows)
-- ============================================================
INSERT INTO mcp_tools (id, mcp_server_id, name, description, input_schema, is_active) VALUES
('71cac689-1a74-6157-697e-753ae46da2e4', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'search_repos', 'Search GitHub repositories', '{"type": "object", "properties": {"query": {"type": "string"}, "language": {"type": "string"}}, "required": ["query"]}', true),
('a08600df-cef0-5298-a437-dd11f8efe295', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'get_file_contents', 'Retrieve file contents from a repository', '{"type": "object", "properties": {"repo": {"type": "string"}, "path": {"type": "string"}, "ref": {"type": "string"}}, "required": ["repo", "path"]}', true),
('e5417df3-74a1-7132-9d25-4083f8af8726', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'create_pull_request', 'Create a new pull request', '{"type": "object", "properties": {"repo": {"type": "string"}, "title": {"type": "string"}, "body": {"type": "string"}, "head": {"type": "string"}, "base": {"type": "string"}}, "required": ["repo", "title", "head", "base"]}', true),
('e488d471-ae5f-ad77-178e-15296bcb0691', '9ca4f324-93d3-73af-31b0-69f382a00d6f', 'create_ticket', 'Create a new Jira ticket', '{"type": "object", "properties": {"project": {"type": "string"}, "summary": {"type": "string"}, "description": {"type": "string"}, "issue_type": {"type": "string"}}, "required": ["project", "summary"]}', true),
('7d9b32b9-8e3c-1839-529f-06e9aa7b7ca0', '9ca4f324-93d3-73af-31b0-69f382a00d6f', 'search_issues', 'Search Jira issues', '{"type": "object", "properties": {"jql": {"type": "string"}, "max_results": {"type": "integer"}}, "required": ["jql"]}', true),
('ad759dda-04ce-77b3-7290-85a5771d6b8e', 'cba99450-f368-2697-25ba-d7927168746a', 'send_message', 'Send a Slack message', '{"type": "object", "properties": {"channel": {"type": "string"}, "text": {"type": "string"}, "thread_ts": {"type": "string"}}, "required": ["channel", "text"]}', true),
('7cdd8adb-9baf-6850-737e-2fef549d83af', 'cba99450-f368-2697-25ba-d7927168746a', 'search_messages', 'Search Slack messages', '{"type": "object", "properties": {"query": {"type": "string"}, "channel": {"type": "string"}}, "required": ["query"]}', true),
('9b06c82b-5faf-dc3f-d504-e8eadde8291f', '0f83fe75-ac60-767f-427d-c23bdbb27593', 'execute_query', 'Execute a SQL query', '{"type": "object", "properties": {"query": {"type": "string"}, "params": {"type": "array"}}, "required": ["query"]}', true);

-- ============================================================
-- 25. MCP_CAPABILITIES (6 rows)
-- ============================================================
INSERT INTO mcp_capabilities (id, mcp_server_id, capability_type, config) VALUES
('8b005bd2-a590-e1d5-5ac9-c2f5bdd221e1', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'tools', '{"tools": ["search_repos", "get_file_contents", "create_pull_request"]}'),
('61e4eccb-2dda-2587-edbb-22eb8a0f1e51', 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', 'resources', '{"resources": ["repo://{owner}/{repo}/contents/**", "repo://{owner}/{repo}/issues/**"]}'),
('f83e4144-43dd-52f5-26af-cc9ac912004b', '9ca4f324-93d3-73af-31b0-69f382a00d6f', 'tools', '{"tools": ["create_ticket", "search_issues", "update_ticket"]}'),
('724e49dd-05b7-2234-8b7a-cfcdfa88ad68', 'cba99450-f368-2697-25ba-d7927168746a', 'tools', '{"tools": ["send_message", "search_messages", "get_channel_info"]}'),
('ed742ec8-da9d-87fb-3c7f-dea98fe8aeeb', 'cba99450-f368-2697-25ba-d7927168746a', 'resources', '{"resources": ["slack://channels/**", "slack://users/**"]}'),
('51515b4b-a91e-54ae-61eb-de3a08343c83', '0f83fe75-ac60-767f-427d-c23bdbb27593', 'tools', '{"tools": ["execute_query", "get_schema", "explain_query"]}');

-- ============================================================
-- 26. API_KEYS (5 rows)
-- ============================================================
INSERT INTO api_keys (id, user_id, org_id, key_hash, name, scope, created_at, expires_at, last_used_at, is_active, permissions) VALUES
('aa111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111', 'sha256:abc123def456', 'Production API Key', 'full', '2025-01-20 09:00:00+00', '2027-01-20 09:00:00+00', '2026-06-05 08:30:00+00', true, '{"allowed_ips": ["10.0.0.0/8"]}'),
('aa222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'a1111111-1111-1111-1111-111111111111', 'sha256:ghi789jkl012', 'Dev Testing Key', 'full', '2025-03-01 10:00:00+00', NULL, '2026-06-04 16:00:00+00', true, '{"allowed_ips": ["127.0.0.1"]}'),
('aa333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'a1111111-1111-1111-1111-111111111111', 'sha256:mno345pqr678', 'Read-Only Analytics', 'read_only', '2025-04-15 11:00:00+00', '2026-12-31 23:59:59+00', '2026-06-03 14:20:00+00', true, '{}'),
('aa444444-4444-4444-4444-444444444444', 'b4444444-4444-4444-4444-444444444444', 'a2222222-2222-2222-2222-222222222222', 'sha256:stu901vwx234', 'Beta Labs Production', 'full', '2025-04-01 08:00:00+00', '2027-04-01 08:00:00+00', '2026-06-05 09:15:00+00', true, '{"allowed_ips": ["192.168.0.0/16"]}'),
('aa555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555', 'a2222222-2222-2222-2222-222222222222', 'sha256:yza567bcd890', 'Research API Key', 'full', '2025-05-10 10:00:00+00', NULL, '2026-06-02 11:30:00+00', true, '{}');

-- ============================================================
-- 27. SESSIONS (5 rows)
-- ============================================================
INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, started_at, expires_at, last_activity_at, is_active) VALUES
('bb111111-1111-1111-1111-111111111111', 'b1111111-1111-1111-1111-111111111111', 'sha256:session_token_001', '10.0.1.15', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '2026-06-05 08:30:00+00', '2026-06-06 08:30:00+00', '2026-06-05 08:45:00+00', true),
('bb222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222', 'sha256:session_token_002', '10.0.1.23', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '2026-06-05 07:45:00+00', '2026-06-06 07:45:00+00', '2026-06-05 08:00:00+00', true),
('bb333333-3333-3333-3333-333333333333', 'b3333333-3333-3333-3333-333333333333', 'sha256:session_token_003', '10.0.1.42', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36', '2026-06-04 16:20:00+00', '2026-06-05 16:20:00+00', '2026-06-04 17:00:00+00', false),
('bb444444-4444-4444-4444-444444444444', 'b4444444-4444-4444-4444-444444444444', 'sha256:session_token_004', '192.168.1.10', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', '2026-06-05 09:00:00+00', '2026-06-06 09:00:00+00', '2026-06-05 09:30:00+00', true),
('bb555555-5555-5555-5555-555555555555', 'b5555555-5555-5555-5555-555555555555', 'sha256:session_token_005', '192.168.1.25', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', '2026-06-03 11:10:00+00', '2026-06-04 11:10:00+00', '2026-06-03 12:00:00+00', false);

-- ============================================================
-- 28. REQUEST_LOGS (10 rows)
-- ============================================================
INSERT INTO request_logs (id, request_id, user_id, api_key_id, model_id, virtual_model_id, prompt_registry_id, mcp_server_id, guardrail_profile_id, matched_rule_id, started_at, completed_at, method, path, status_code, input_tokens, output_tokens, cached_tokens, cost, latency_ms, request_headers, response_headers, error_message, trace_id, region) VALUES
('cc111111-1111-1111-1111-111111111111', '90000001-0000-4000-8000-000000000001', 'b1111111-1111-1111-1111-111111111111', 'aa111111-1111-1111-1111-111111111111', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'fd5b6123-229f-d20f-a811-41ddb843a72f', '33959841-7338-bab5-f727-d9759cecd8da', NULL, '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', '1894617d-c7b1-f0ff-a5b1-c2c669e32d9d', '2026-06-05 08:30:15+00', '2026-06-05 08:30:18+00', 'POST', '/v1/chat/completions', 200, 450, 320, 0, 0.008450, 2850, '{"content-type": "application/json", "authorization": "Bearer ***"}', '{"content-type": "application/json", "x-request-id": "req-001"}', NULL, 'trace-001-span-001', 'us-east-1'),

('cc222222-2222-2222-2222-222222222222', '90000002-0000-4000-8000-000000000002', 'b2222222-2222-2222-2222-222222222222', 'aa222222-2222-2222-2222-222222222222', '41551ad7-8d38-1c8e-69ee-32765ec6b51f', 'f93c7053-440b-5b37-7a67-df6cba0bfdd8', 'ee4aa7b3-eea5-87da-4f78-3c8b44ecc4cc', NULL, '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'ae845d79-1aa2-851a-457c-a3562be8a9dd', '2026-06-05 08:31:00+00', '2026-06-05 08:31:05+00', 'POST', '/v1/chat/completions', 200, 1200, 850, 0, 0.024300, 5200, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-002-span-001', 'us-east-1'),

('cc333333-3333-3333-3333-333333333333', '90000003-0000-4000-8000-000000000003', 'b2222222-2222-2222-2222-222222222222', 'aa222222-2222-2222-2222-222222222222', '8c267361-5f78-8836-4b4c-8e1a3651c5ad', 'fd5b6123-229f-d20f-a811-41ddb843a72f', NULL, NULL, '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', '6f84e822-a8f3-deff-0d5c-f25aea6ca2c0', '2026-06-05 08:32:10+00', '2026-06-05 08:32:12+00', 'POST', '/v1/chat/completions', 200, 150, 95, 0, 0.000645, 1800, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-003-span-001', 'us-west-2'),

('cc444444-4444-4444-4444-444444444444', '90000004-0000-4000-8000-000000000004', 'b1111111-1111-1111-1111-111111111111', 'aa111111-1111-1111-1111-111111111111', '7652e905-d3c6-8349-2cf9-f514a40d8ff9', 'fd5b6123-229f-d20f-a811-41ddb843a72f', NULL, NULL, '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'b03aee3f-806d-19ac-15ff-a531ceffbb61', '2026-06-05 08:33:00+00', '2026-06-05 08:33:08+00', 'POST', '/v1/chat/completions', 200, 2800, 1500, 0, 0.168000, 7800, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-004-span-001', 'us-east-1'),

('cc555555-5555-5555-5555-555555555555', '90000005-0000-4000-8000-000000000005', 'b5555555-5555-5555-5555-555555555555', 'aa555555-5555-5555-5555-555555555555', '79d3285a-6d36-04c8-5389-4a30d3791175', '8edf9a64-a926-99d2-af63-6c02007fcfc2', '2f2e1508-f4af-5f81-0344-4e685f5306f1', NULL, '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', '7a8c6263-d8bc-2eab-e5e3-7a546dc3a3c4', '2026-06-05 08:34:30+00', '2026-06-05 08:34:45+00', 'POST', '/v1/chat/completions', 200, 150000, 45000, 50000, 0.595000, 15200, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-005-span-001', 'eu-west-1'),

('cc666666-6666-6666-6666-666666666666', '90000006-0000-4000-8000-000000000006', 'b4444444-4444-4444-4444-444444444444', 'aa444444-4444-4444-4444-444444444444', '78259241-148b-39d6-217c-25c2bfcb8ba7', '4f8f8f5d-f129-2086-9b0d-36c31890324d', NULL, NULL, '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', '1a4e71fc-0d45-c41e-5b66-9725e5a7d471', '2026-06-05 08:35:00+00', '2026-06-05 08:35:03+00', 'POST', '/v1/chat/completions', 200, 800, 400, 0, 0.008800, 3200, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-006-span-001', 'us-east-1'),

('cc777777-7777-7777-7777-777777777777', '90000007-0000-4000-8000-000000000007', 'b2222222-2222-2222-2222-222222222222', 'aa222222-2222-2222-2222-222222222222', NULL, NULL, NULL, 'b3a27bd5-c597-4fae-ad61-b9cd57883f01', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', NULL, '2026-06-05 08:36:00+00', '2026-06-05 08:36:02+00', 'POST', '/v1/mcp/tools/search_repos', 200, 50, 200, 0, 0.000000, 1200, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-007-span-001', 'us-east-1'),

('cc888888-8888-8888-8888-888888888888', '90000008-0000-4000-8000-000000000008', 'b5555555-5555-5555-5555-555555555555', 'aa555555-5555-5555-5555-555555555555', 'eb7608f0-f2dc-e6fe-c32f-7e36262d5c37', '8edf9a64-a926-99d2-af63-6c02007fcfc2', '2f2e1508-f4af-5f81-0344-4e685f5306f1', NULL, '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', '094f7350-8139-e083-2ee6-cabd5c8b46a1', '2026-06-05 08:37:00+00', '2026-06-05 08:37:04+00', 'POST', '/v1/chat/completions', 200, 3500, 1200, 0, 0.028500, 4100, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-008-span-001', 'eu-west-1'),

('cc999999-9999-9999-9999-999999999999', '90000009-0000-4000-8000-000000000009', 'b1111111-1111-1111-1111-111111111111', 'aa111111-1111-1111-1111-111111111111', 'c7f12df7-e6a7-2f7d-033e-ffb62a6dd0d6', 'fd5b6123-229f-d20f-a811-41ddb843a72f', NULL, NULL, '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', '69411a4b-b633-2c48-e259-45b5db8ad5f3', '2026-06-05 08:38:00+00', '2026-06-05 08:38:01+00', 'POST', '/v1/chat/completions', 429, 100, 0, 0, 0.000000, 50, '{"content-type": "application/json"}', '{"content-type": "application/json", "retry-after": "60"}', 'Rate limit exceeded', 'trace-009-span-001', 'us-east-1'),

('cc101010-1010-1010-1010-101010101010', '90000010-0000-4000-8000-000000000010', 'b4444444-4444-4444-4444-444444444444', 'aa444444-4444-4444-4444-444444444444', 'd73e63e4-47eb-acb5-792f-38bd1e7cf5a9', '4f8f8f5d-f129-2086-9b0d-36c31890324d', NULL, NULL, '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', '53872684-9efa-0da4-27d7-54bb2d9a769b', '2026-06-05 08:39:00+00', '2026-06-05 08:39:02+00', 'POST', '/v1/chat/completions', 200, 600, 300, 0, 0.005400, 2100, '{"content-type": "application/json"}', '{"content-type": "application/json"}', NULL, 'trace-010-span-001', 'us-west-2');

-- ============================================================
-- 29. BUDGET_CONSUMPTIONS (10 rows)
-- ============================================================
INSERT INTO budget_consumptions (id, user_budget_id, user_id, request_id, amount, currency, usage_type, quantity, consumed_at, status) VALUES
('dd111111-1111-1111-1111-111111111111', 'ff46d7e3-2d9a-b3d2-5433-d856a49a915c', 'b1111111-1111-1111-1111-111111111111', '90000001-0000-4000-8000-000000000001', 0.008450, 'USD', 'tokens', 770, '2026-06-05 08:30:18+00', 'committed'),
('dd222222-2222-2222-2222-222222222222', 'd70f2341-79fe-c8ca-a3dd-9ad7a2a41d8a', 'b2222222-2222-2222-2222-222222222222', '90000002-0000-4000-8000-000000000002', 0.024300, 'USD', 'tokens', 2050, '2026-06-05 08:31:05+00', 'committed'),
('dd333333-3333-3333-3333-333333333333', 'c9c0c875-4336-47a4-d83e-05437508e9ff', 'b2222222-2222-2222-2222-222222222222', '90000003-0000-4000-8000-000000000003', 0.000645, 'USD', 'tokens', 245, '2026-06-05 08:32:12+00', 'committed'),
('dd444444-4444-4444-4444-444444444444', 'ff46d7e3-2d9a-b3d2-5433-d856a49a915c', 'b1111111-1111-1111-1111-111111111111', '90000004-0000-4000-8000-000000000004', 0.168000, 'USD', 'tokens', 4300, '2026-06-05 08:33:08+00', 'committed'),
('dd555555-5555-5555-5555-555555555555', '216088f4-ca85-36a5-1d02-ff8088f1b4ee', 'b5555555-5555-5555-5555-555555555555', '90000005-0000-4000-8000-000000000005', 0.595000, 'USD', 'tokens', 195000, '2026-06-05 08:34:45+00', 'committed'),
('dd666666-6666-6666-6666-666666666666', 'a28943cf-9d87-1fe1-44a7-ecc254b9b02b', 'b4444444-4444-4444-4444-444444444444', '90000006-0000-4000-8000-000000000006', 0.008800, 'USD', 'tokens', 1200, '2026-06-05 08:35:03+00', 'committed'),
('dd777777-7777-7777-7777-777777777777', 'd70f2341-79fe-c8ca-a3dd-9ad7a2a41d8a', 'b2222222-2222-2222-2222-222222222222', '90000007-0000-4000-8000-000000000007', 0.000000, 'USD', 'requests', 1, '2026-06-05 08:36:02+00', 'committed'),
('dd888888-8888-8888-8888-888888888888', '216088f4-ca85-36a5-1d02-ff8088f1b4ee', 'b5555555-5555-5555-5555-555555555555', '90000008-0000-4000-8000-000000000008', 0.028500, 'USD', 'tokens', 4700, '2026-06-05 08:37:04+00', 'committed'),
('dd999999-9999-9999-9999-999999999999', 'ff46d7e3-2d9a-b3d2-5433-d856a49a915c', 'b1111111-1111-1111-1111-111111111111', '90000009-0000-4000-8000-000000000009', 0.000000, 'USD', 'tokens', 100, '2026-06-05 08:38:01+00', 'pending'),
('dd101010-1010-1010-1010-101010101010', 'a28943cf-9d87-1fe1-44a7-ecc254b9b02b', 'b4444444-4444-4444-4444-444444444444', '90000010-0000-4000-8000-000000000010', 0.005400, 'USD', 'tokens', 900, '2026-06-05 08:39:02+00', 'committed');

-- ============================================================
-- 30. GUARDRAIL_VIOLATIONS (6 rows)
-- ============================================================
INSERT INTO guardrail_violations (id, request_id, guardrail_profile_id, rule_type, severity, triggered_content_snippet, action_taken, triggered_at, metadata) VALUES
('ee111111-1111-1111-1111-111111111111', 'cc222222-2222-2222-2222-222222222222', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'content', 'medium', '[REDACTED: potential PII in code comment]', 'warn', '2026-06-05 08:31:02+00', '{"rule_name": "pii_detection", "confidence": 0.72}'),
('ee222222-2222-2222-2222-222222222222', 'cc444444-4444-4444-4444-444444444444', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'content', 'low', '[REDACTED]', 'log', '2026-06-05 08:33:01+00', '{"rule_name": "hate_speech", "confidence": 0.15}'),
('ee333333-3333-3333-3333-333333333333', 'cc555555-5555-5555-5555-555555555555', '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', 'custom', 'high', '[REDACTED: potential data exfiltration pattern]', 'warn', '2026-06-05 08:34:35+00', '{"rule_name": "data_exfiltration", "confidence": 0.88, "matched_pattern": "\\b[A-Z]{2,}\\d{6,}\\b"}'),
('ee444444-4444-4444-4444-444444444444', 'cc666666-6666-6666-6666-666666666666', '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', 'rate', 'low', NULL, 'log', '2026-06-05 08:35:00+00', '{"rule_name": "requests_per_minute", "current_rate": 45, "limit": 200}'),
('ee555555-5555-5555-5555-555555555555', 'cc888888-8888-8888-8888-888888888888', '37ef5ffa-2e48-42d1-5f03-d5141b36abc9', 'content', 'low', '[REDACTED]', 'log', '2026-06-05 08:37:01+00', '{"rule_name": "hate_speech", "confidence": 0.08}'),
('ee666666-6666-6666-6666-666666666666', 'cc999999-9999-9999-9999-999999999999', '3c7c721b-c59f-8766-124e-eb4fb6c6cb10', 'rate', 'critical', NULL, 'block', '2026-06-05 08:38:00+00', '{"rule_name": "requests_per_minute", "current_rate": 65, "limit": 60, "window_start": "2026-06-05 08:37:00+00"}');



ALTER TABLE guardrail_violations ENABLE TRIGGER ALL;
ALTER TABLE budget_consumptions ENABLE TRIGGER ALL;
ALTER TABLE request_logs ENABLE TRIGGER ALL;
ALTER TABLE sessions ENABLE TRIGGER ALL;
ALTER TABLE api_keys ENABLE TRIGGER ALL;
ALTER TABLE mcp_capabilities ENABLE TRIGGER ALL;
ALTER TABLE mcp_tools ENABLE TRIGGER ALL;
ALTER TABLE role_mcps ENABLE TRIGGER ALL;
ALTER TABLE mcp_servers ENABLE TRIGGER ALL;
ALTER TABLE virtual_model_rules ENABLE TRIGGER ALL;
ALTER TABLE role_virtual_models ENABLE TRIGGER ALL;
ALTER TABLE virtual_models ENABLE TRIGGER ALL;
ALTER TABLE pricing_tiers ENABLE TRIGGER ALL;
ALTER TABLE model_versions ENABLE TRIGGER ALL;
ALTER TABLE role_models ENABLE TRIGGER ALL;
ALTER TABLE models ENABLE TRIGGER ALL;
ALTER TABLE prompt_deployments ENABLE TRIGGER ALL;
ALTER TABLE prompt_versions ENABLE TRIGGER ALL;
ALTER TABLE role_prompt_registries ENABLE TRIGGER ALL;
ALTER TABLE prompt_registries ENABLE TRIGGER ALL;
ALTER TABLE role_guardrails ENABLE TRIGGER ALL;
ALTER TABLE guardrail_profiles ENABLE TRIGGER ALL;
ALTER TABLE user_budgets ENABLE TRIGGER ALL;
ALTER TABLE role_budgets ENABLE TRIGGER ALL;
ALTER TABLE budgets ENABLE TRIGGER ALL;
ALTER TABLE role_permissions ENABLE TRIGGER ALL;
ALTER TABLE user_roles ENABLE TRIGGER ALL;
ALTER TABLE roles ENABLE TRIGGER ALL;
ALTER TABLE users ENABLE TRIGGER ALL;
ALTER TABLE organizations ENABLE TRIGGER ALL;
