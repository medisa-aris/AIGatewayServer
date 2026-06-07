-- ============================================================
-- AI Gateway Database Schema
-- PostgreSQL 16
-- Generated: 2026-06-05
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    tier VARCHAR(50) NOT NULL DEFAULT 'free',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true,
    settings JSONB NOT NULL DEFAULT '{}',
    billing_email VARCHAR(255)
);

CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_is_active ON organizations(is_active);

COMMENT ON TABLE organizations IS 'Root tenant entity. All resources belong to exactly one organization.';
COMMENT ON COLUMN organizations.tier IS 'Subscription tier: free, pro, enterprise';
COMMENT ON COLUMN organizations.settings IS 'Organization-wide configuration (JSONB)';

-- ============================================================
-- 2. USERS
-- ============================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    auth_provider VARCHAR(50) NOT NULL,
    external_id VARCHAR(255) NOT NULL,
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT unique_user_email UNIQUE (email),
    CONSTRAINT unique_user_org_external UNIQUE (org_id, external_id)
);

CREATE INDEX idx_users_org_id ON users(org_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_external_id ON users(external_id);

COMMENT ON TABLE users IS 'Identity within an organization. Users authenticate via external providers.';
COMMENT ON COLUMN users.auth_provider IS 'SSO provider: google, okta, saml';
COMMENT ON COLUMN users.external_id IS 'Provider-specific user ID';

-- ============================================================
-- 3. ROLES
-- ============================================================
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    scope VARCHAR(20) NOT NULL DEFAULT 'org' CHECK (scope IN ('org', 'project', 'system')),
    is_system BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_roles_org_id ON roles(org_id);
CREATE INDEX idx_roles_name ON roles(name);

COMMENT ON TABLE roles IS 'Role definitions scoped to an organization. System roles are immutable templates.';
COMMENT ON COLUMN roles.scope IS 'Visibility: org, project, system';
COMMENT ON COLUMN roles.is_system IS 'Built-in role (non-editable)';

-- ============================================================
-- 4. USER_ROLES
-- ============================================================
CREATE TABLE user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by UUID REFERENCES users(id) ON DELETE SET NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    context JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT unique_user_role UNIQUE (user_id, role_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX idx_user_roles_role_id ON user_roles(role_id);
CREATE INDEX idx_user_roles_granted_by ON user_roles(granted_by);

COMMENT ON TABLE user_roles IS 'Many-to-many junction between users and roles with grant metadata.';
COMMENT ON COLUMN user_roles.context IS 'Assignment metadata (project scope, etc.)';

-- ============================================================
-- 5. ROLE_PERMISSIONS
-- ============================================================
CREATE TABLE role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL CHECK (resource IN ('prompt', 'model', 'virtual_model', 'mcp', 'budget', 'guardrail', 'user', 'role', 'org', 'analytics')),
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete', 'execute', 'admin')),
    condition TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_resource ON role_permissions(resource);
CREATE INDEX idx_role_permissions_action ON role_permissions(action);

COMMENT ON TABLE role_permissions IS 'Granular CRUD+execute permissions per resource type.';
COMMENT ON COLUMN role_permissions.resource IS 'Resource type: prompt, model, virtual_model, mcp, budget, guardrail, user, role, org, analytics';
COMMENT ON COLUMN role_permissions.action IS 'Action: create, read, update, delete, execute, admin';
COMMENT ON COLUMN role_permissions.condition IS 'Optional conditional expression (e.g., org_id = current_org)';

-- ============================================================
-- 6. BUDGETS
-- ============================================================
CREATE TABLE budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    total_amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    remaining_amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    period VARCHAR(20) NOT NULL CHECK (period IN ('daily', 'weekly', 'monthly', 'quarterly', 'annual')),
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_shared BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT chk_budget_period CHECK (period_end > period_start)
);

CREATE INDEX idx_budgets_org_id ON budgets(org_id);
CREATE INDEX idx_budgets_is_active ON budgets(is_active);
CREATE INDEX idx_budgets_period ON budgets(period_start, period_end);

COMMENT ON TABLE budgets IS 'Organization-level budget pools with time-bounded allocations.';
COMMENT ON COLUMN budgets.period IS 'Billing period: daily, weekly, monthly, quarterly, annual';
COMMENT ON COLUMN budgets.is_shared IS 'Shared across all roles';

-- ============================================================
-- 7. ROLE_BUDGETS
-- ============================================================
CREATE TABLE role_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    max_budget_per_user DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    max_budget_per_request DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    spend_scope VARCHAR(20) NOT NULL DEFAULT 'own' CHECK (spend_scope IN ('own', 'team', 'org')),
    can_override BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT unique_role_budget UNIQUE (role_id, budget_id)
);

CREATE INDEX idx_role_budgets_role_id ON role_budgets(role_id);
CREATE INDEX idx_role_budgets_budget_id ON role_budgets(budget_id);

COMMENT ON TABLE role_budgets IS 'Role-level budget policy: maximum spend ceiling per user.';
COMMENT ON COLUMN role_budgets.max_budget_per_user IS 'Max spend per user';
COMMENT ON COLUMN role_budgets.max_budget_per_request IS 'Max cost per request';
COMMENT ON COLUMN role_budgets.spend_scope IS 'Visibility: own, team, org';
COMMENT ON COLUMN role_budgets.can_override IS 'Admin override privilege';

-- ============================================================
-- 8. USER_BUDGETS
-- ============================================================
CREATE TABLE user_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_budget_id UUID NOT NULL REFERENCES role_budgets(id) ON DELETE CASCADE,
    budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
    allocated_amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    consumed_amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    remaining_amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'frozen')),
    allocated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reset_at TIMESTAMPTZ,
    CONSTRAINT unique_user_role_budget UNIQUE (user_id, role_budget_id)
);

CREATE INDEX idx_user_budgets_user_id ON user_budgets(user_id);
CREATE INDEX idx_user_budgets_budget_id ON user_budgets(budget_id);
CREATE INDEX idx_user_budgets_status ON user_budgets(status);
CREATE INDEX idx_user_budgets_reset_at ON user_budgets(reset_at);

COMMENT ON TABLE user_budgets IS 'Per-user budget allocation derived from role policy.';
COMMENT ON COLUMN user_budgets.allocated_amount IS 'Computed from role max_budget_per_user';
COMMENT ON COLUMN user_budgets.remaining_amount IS 'allocated - consumed (stored for fast lookup)';
COMMENT ON COLUMN user_budgets.status IS 'State: active, exhausted, frozen';

-- ============================================================
-- 9. BUDGET_CONSUMPTIONS
-- ============================================================
CREATE TABLE budget_consumptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_budget_id UUID NOT NULL REFERENCES user_budgets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    amount DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    usage_type VARCHAR(20) NOT NULL CHECK (usage_type IN ('tokens', 'requests', 'compute_time')),
    quantity BIGINT NOT NULL DEFAULT 0,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'committed', 'refunded'))
);

CREATE INDEX idx_budget_consumptions_user_budget_id ON budget_consumptions(user_budget_id);
CREATE INDEX idx_budget_consumptions_user_id ON budget_consumptions(user_id);
CREATE INDEX idx_budget_consumptions_request_id ON budget_consumptions(request_id);
CREATE INDEX idx_budget_consumptions_consumed_at ON budget_consumptions(consumed_at);
CREATE INDEX idx_budget_consumptions_status ON budget_consumptions(status);

COMMENT ON TABLE budget_consumptions IS 'Individual spend transactions tied to requests.';
COMMENT ON COLUMN budget_consumptions.usage_type IS 'Metric: tokens, requests, compute_time';
COMMENT ON COLUMN budget_consumptions.status IS 'State: pending, committed, refunded';

-- ============================================================
-- 10. GUARDRAIL_PROFILES
-- ============================================================
CREATE TABLE guardrail_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    content_policy JSONB NOT NULL DEFAULT '[]',
    pii_rules JSONB NOT NULL DEFAULT '[]',
    topic_filters JSONB NOT NULL DEFAULT '[]',
    rate_limits JSONB NOT NULL DEFAULT '{}',
    custom_rules JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_guardrail_profiles_org_id ON guardrail_profiles(org_id);
CREATE INDEX idx_guardrail_profiles_is_default ON guardrail_profiles(is_default);
CREATE INDEX idx_guardrail_profiles_is_active ON guardrail_profiles(is_active);

COMMENT ON TABLE guardrail_profiles IS 'Reusable policy bundles for content filtering, PII, topics, and rate limiting.';
COMMENT ON COLUMN guardrail_profiles.content_policy IS 'Content moderation rules (JSONB array)';
COMMENT ON COLUMN guardrail_profiles.pii_rules IS 'PII detection/redaction rules (JSONB array)';
COMMENT ON COLUMN guardrail_profiles.topic_filters IS 'Allowed/blocked topic lists (JSONB array)';
COMMENT ON COLUMN guardrail_profiles.rate_limits IS 'Per-user rate limits (JSONB object)';
COMMENT ON COLUMN guardrail_profiles.custom_rules IS 'Organization-specific rules (JSONB array)';

-- ============================================================
-- 11. ROLE_GUARDRAILS
-- ============================================================
CREATE TABLE role_guardrails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    guardrail_profile_id UUID NOT NULL REFERENCES guardrail_profiles(id) ON DELETE CASCADE,
    is_mandatory BOOLEAN NOT NULL DEFAULT true,
    can_bypass BOOLEAN NOT NULL DEFAULT false,
    bypass_approval VARCHAR(50) CHECK (bypass_approval IN ('manager', 'admin', 'auto')),
    CONSTRAINT unique_role_guardrail UNIQUE (role_id, guardrail_profile_id)
);

CREATE INDEX idx_role_guardrails_role_id ON role_guardrails(role_id);
CREATE INDEX idx_role_guardrails_guardrail_profile_id ON role_guardrails(guardrail_profile_id);

COMMENT ON TABLE role_guardrails IS 'Role-to-guardrail binding with enforcement mode.';
COMMENT ON COLUMN role_guardrails.is_mandatory IS 'Cannot be disabled by user';
COMMENT ON COLUMN role_guardrails.can_bypass IS 'Bypass allowed with approval';
COMMENT ON COLUMN role_guardrails.bypass_approval IS 'Required approver: manager, admin, auto';

-- ============================================================
-- 12. PROMPT_REGISTRIES
-- ============================================================
CREATE TABLE prompt_registries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'team', 'org')),
    category VARCHAR(50),
    tags JSONB NOT NULL DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_registries_org_id ON prompt_registries(org_id);
CREATE INDEX idx_prompt_registries_visibility ON prompt_registries(visibility);
CREATE INDEX idx_prompt_registries_category ON prompt_registries(category);
CREATE INDEX idx_prompt_registries_tags ON prompt_registries USING GIN (tags);

COMMENT ON TABLE prompt_registries IS 'Collections of versioned prompt templates.';
COMMENT ON COLUMN prompt_registries.visibility IS 'Access: private, team, org';
COMMENT ON COLUMN prompt_registries.tags IS 'Searchable tags (JSONB array)';

-- ============================================================
-- 13. ROLE_PROMPT_REGISTRIES
-- ============================================================
CREATE TABLE role_prompt_registries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    prompt_registry_id UUID NOT NULL REFERENCES prompt_registries(id) ON DELETE CASCADE,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'write', 'execute', 'admin')),
    can_fork BOOLEAN NOT NULL DEFAULT false,
    can_deploy BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT unique_role_prompt_registry UNIQUE (role_id, prompt_registry_id)
);

CREATE INDEX idx_role_prompt_registries_role_id ON role_prompt_registries(role_id);
CREATE INDEX idx_role_prompt_registries_prompt_registry_id ON role_prompt_registries(prompt_registry_id);

COMMENT ON TABLE role_prompt_registries IS 'Role access to prompt registries.';
COMMENT ON COLUMN role_prompt_registries.access_level IS 'Permission: read, write, execute, admin';

-- ============================================================
-- 14. PROMPT_VERSIONS
-- ============================================================
CREATE TABLE prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registry_id UUID NOT NULL REFERENCES prompt_registries(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    prompt_template TEXT NOT NULL,
    variables JSONB NOT NULL DEFAULT '[]',
    metadata JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'deprecated')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_registry_version UNIQUE (registry_id, version_number)
);

CREATE INDEX idx_prompt_versions_registry_id ON prompt_versions(registry_id);
CREATE INDEX idx_prompt_versions_author_id ON prompt_versions(author_id);
CREATE INDEX idx_prompt_versions_status ON prompt_versions(status);

COMMENT ON TABLE prompt_versions IS 'Versioned prompt templates within a registry.';
COMMENT ON COLUMN prompt_versions.prompt_template IS 'The prompt template with placeholders';
COMMENT ON COLUMN prompt_versions.variables IS 'Required variable definitions (JSONB array)';
COMMENT ON COLUMN prompt_versions.status IS 'State: draft, published, deprecated';

-- ============================================================
-- 15. PROMPT_DEPLOYMENTS
-- ============================================================
CREATE TABLE prompt_deployments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version_id UUID NOT NULL REFERENCES prompt_versions(id) ON DELETE CASCADE,
    deployed_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint_alias VARCHAR(100) NOT NULL UNIQUE,
    runtime_config JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    deployed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prompt_deployments_version_id ON prompt_deployments(version_id);
CREATE INDEX idx_prompt_deployments_deployed_by ON prompt_deployments(deployed_by);
CREATE INDEX idx_prompt_deployments_is_active ON prompt_deployments(is_active);

COMMENT ON TABLE prompt_deployments IS 'Deployed prompt versions exposed as callable endpoints.';
COMMENT ON COLUMN prompt_deployments.endpoint_alias IS 'Public endpoint path';
COMMENT ON COLUMN prompt_deployments.runtime_config IS 'Execution parameters (temperature, etc.)';

-- ============================================================
-- 16. MODELS
-- ============================================================
CREATE TABLE models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL,
    model_id VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    modality VARCHAR(50) NOT NULL CHECK (modality IN ('text', 'image', 'audio', 'video', 'multimodal')),
    capabilities JSONB NOT NULL DEFAULT '[]',
    max_tokens INTEGER,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_models_org_id ON models(org_id);
CREATE INDEX idx_models_modality ON models(modality);
CREATE INDEX idx_models_is_active ON models(is_active);
CREATE INDEX idx_models_capabilities ON models USING GIN (capabilities);

COMMENT ON TABLE models IS 'Base AI models registered from upstream providers.';
COMMENT ON COLUMN models.model_id IS 'Provider model ID: gpt-4, claude-3-opus';
COMMENT ON COLUMN models.modality IS 'Capability: text, image, audio, video, multimodal';
COMMENT ON COLUMN models.capabilities IS 'Feature flags: reasoning, vision, json_mode (JSONB array)';

-- ============================================================
-- 17. ROLE_MODELS
-- ============================================================
CREATE TABLE role_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'execute', 'admin')),
    can_fine_tune BOOLEAN NOT NULL DEFAULT false,
    max_quota_per_request DECIMAL(18,6),
    CONSTRAINT unique_role_model UNIQUE (role_id, model_id)
);

CREATE INDEX idx_role_models_role_id ON role_models(role_id);
CREATE INDEX idx_role_models_model_id ON role_models(model_id);

COMMENT ON TABLE role_models IS 'Role access to base models.';
COMMENT ON COLUMN role_models.access_level IS 'Permission: read, execute, admin';
COMMENT ON COLUMN role_models.max_quota_per_request IS 'Max tokens/cost per request';

-- ============================================================
-- 18. MODEL_VERSIONS
-- ============================================================
CREATE TABLE model_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    version VARCHAR(50) NOT NULL,
    deployment_status VARCHAR(20) NOT NULL DEFAULT 'staging' CHECK (deployment_status IN ('staging', 'production', 'deprecated')),
    config JSONB NOT NULL DEFAULT '{}',
    released_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_model_version UNIQUE (model_id, version)
);

CREATE INDEX idx_model_versions_model_id ON model_versions(model_id);
CREATE INDEX idx_model_versions_deployment_status ON model_versions(deployment_status);

COMMENT ON TABLE model_versions IS 'Versioned model deployments with configuration snapshots.';
COMMENT ON COLUMN model_versions.deployment_status IS 'State: staging, production, deprecated';
COMMENT ON COLUMN model_versions.config IS 'Model-specific configuration (JSONB)';

-- ============================================================
-- 19. PRICING_TIERS
-- ============================================================
CREATE TABLE pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    tier_name VARCHAR(50) NOT NULL,
    input_price DECIMAL(18,12) NOT NULL DEFAULT 0.00,
    output_price DECIMAL(18,12) NOT NULL DEFAULT 0.00,
    cached_price DECIMAL(18,12) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    effective_from TIMESTAMPTZ NOT NULL,
    effective_to TIMESTAMPTZ,
    CONSTRAINT chk_pricing_dates CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_pricing_tiers_model_id ON pricing_tiers(model_id);
CREATE INDEX idx_pricing_tiers_tier_name ON pricing_tiers(tier_name);
CREATE INDEX idx_pricing_tiers_effective ON pricing_tiers(effective_from, effective_to);

COMMENT ON TABLE pricing_tiers IS 'Time-bounded per-token pricing for models.';
COMMENT ON COLUMN pricing_tiers.input_price IS 'Cost per 1K input tokens';
COMMENT ON COLUMN pricing_tiers.output_price IS 'Cost per 1K output tokens';
COMMENT ON COLUMN pricing_tiers.cached_price IS 'Cost per 1K cached tokens';

-- ============================================================
-- 20. VIRTUAL_MODELS
-- ============================================================
CREATE TABLE virtual_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    default_model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_virtual_models_org_id ON virtual_models(org_id);
CREATE INDEX idx_virtual_models_is_active ON virtual_models(is_active);

COMMENT ON TABLE virtual_models IS 'Dynamic rule-based model proxies.';
COMMENT ON COLUMN virtual_models.default_model_id IS 'Fallback when no rules match';

-- ============================================================
-- 21. ROLE_VIRTUAL_MODELS
-- ============================================================
CREATE TABLE role_virtual_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    virtual_model_id UUID NOT NULL REFERENCES virtual_models(id) ON DELETE CASCADE,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'execute', 'admin')),
    can_modify_routing BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT unique_role_virtual_model UNIQUE (role_id, virtual_model_id)
);

CREATE INDEX idx_role_virtual_models_role_id ON role_virtual_models(role_id);
CREATE INDEX idx_role_virtual_models_virtual_model_id ON role_virtual_models(virtual_model_id);

COMMENT ON TABLE role_virtual_models IS 'Role access to virtual models.';
COMMENT ON COLUMN role_virtual_models.can_modify_routing IS 'Can edit rule priorities';

-- ============================================================
-- 22. VIRTUAL_MODEL_RULES
-- ============================================================
CREATE TABLE virtual_model_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    virtual_model_id UUID NOT NULL REFERENCES virtual_models(id) ON DELETE CASCADE,
    target_model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    priority INTEGER NOT NULL,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('price', 'token', 'quality', 'request_type', 'fallback')),
    condition JSONB NOT NULL,
    parameters JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_virtual_model_priority UNIQUE (virtual_model_id, priority)
);

CREATE INDEX idx_virtual_model_rules_virtual_model_id ON virtual_model_rules(virtual_model_id);
CREATE INDEX idx_virtual_model_rules_priority ON virtual_model_rules(priority);
CREATE INDEX idx_virtual_model_rules_rule_type ON virtual_model_rules(rule_type);
CREATE INDEX idx_virtual_model_rules_is_active ON virtual_model_rules(is_active);
CREATE INDEX idx_virtual_model_rules_condition ON virtual_model_rules USING GIN (condition);
CREATE INDEX idx_virtual_model_rules_parameters ON virtual_model_rules USING GIN (parameters);

COMMENT ON TABLE virtual_model_rules IS 'Priority-ordered routing rules for virtual model selection.';
COMMENT ON COLUMN virtual_model_rules.priority IS 'Evaluation order: 1, 2, 3...';
COMMENT ON COLUMN virtual_model_rules.rule_type IS 'Criteria: price, token, quality, request_type, fallback';
COMMENT ON COLUMN virtual_model_rules.condition IS 'Match expression: { operator, threshold, value }';
COMMENT ON COLUMN virtual_model_rules.parameters IS 'Rule config: { max_price, max_tokens, min_quality_score, request_types, fallback_order }';

-- ============================================================
-- 23. MCP_SERVERS
-- ============================================================
CREATE TABLE mcp_servers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    transport VARCHAR(20) NOT NULL CHECK (transport IN ('stdio', 'sse', 'http')),
    endpoint_url VARCHAR(500),
    auth_config JSONB NOT NULL DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'error')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_mcp_servers_org_id ON mcp_servers(org_id);
CREATE INDEX idx_mcp_servers_status ON mcp_servers(status);
CREATE INDEX idx_mcp_servers_is_active ON mcp_servers(is_active);

COMMENT ON TABLE mcp_servers IS 'Registered Model Context Protocol servers.';
COMMENT ON COLUMN mcp_servers.transport IS 'Protocol: stdio, sse, http';
COMMENT ON COLUMN mcp_servers.status IS 'Health: active, inactive, error';

-- ============================================================
-- 24. ROLE_MCPS
-- ============================================================
CREATE TABLE role_mcps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    access_level VARCHAR(20) NOT NULL DEFAULT 'read' CHECK (access_level IN ('read', 'execute', 'admin')),
    can_configure BOOLEAN NOT NULL DEFAULT false,
    allowed_tools JSONB NOT NULL DEFAULT '[]',
    allowed_resources JSONB NOT NULL DEFAULT '[]',
    CONSTRAINT unique_role_mcp UNIQUE (role_id, mcp_server_id)
);

CREATE INDEX idx_role_mcps_role_id ON role_mcps(role_id);
CREATE INDEX idx_role_mcps_mcp_server_id ON role_mcps(mcp_server_id);

COMMENT ON TABLE role_mcps IS 'Role access to MCP servers.';
COMMENT ON COLUMN role_mcps.allowed_tools IS 'Whitelist of tool names (empty = all)';
COMMENT ON COLUMN role_mcps.allowed_resources IS 'Whitelist of resource URIs (empty = all)';

-- ============================================================
-- 25. MCP_TOOLS
-- ============================================================
CREATE TABLE mcp_tools (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    input_schema JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT unique_mcp_tool_name UNIQUE (mcp_server_id, name)
);

CREATE INDEX idx_mcp_tools_mcp_server_id ON mcp_tools(mcp_server_id);
CREATE INDEX idx_mcp_tools_name ON mcp_tools(name);

COMMENT ON TABLE mcp_tools IS 'Tools exposed by an MCP server.';
COMMENT ON COLUMN mcp_tools.input_schema IS 'JSON Schema for tool inputs';

-- ============================================================
-- 26. MCP_CAPABILITIES
-- ============================================================
CREATE TABLE mcp_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mcp_server_id UUID NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
    capability_type VARCHAR(50) NOT NULL CHECK (capability_type IN ('tools', 'resources', 'prompts', 'sampling')),
    config JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_mcp_capabilities_mcp_server_id ON mcp_capabilities(mcp_server_id);
CREATE INDEX idx_mcp_capabilities_capability_type ON mcp_capabilities(capability_type);

COMMENT ON TABLE mcp_capabilities IS 'Server capability advertisements.';
COMMENT ON COLUMN mcp_capabilities.capability_type IS 'Capability: tools, resources, prompts, sampling';

-- ============================================================
-- 27. API_KEYS
-- ============================================================
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    scope VARCHAR(50) NOT NULL DEFAULT 'full',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT true,
    permissions JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX idx_api_keys_is_active ON api_keys(is_active);

COMMENT ON TABLE api_keys IS 'Scoped authentication tokens for programmatic access.';
COMMENT ON COLUMN api_keys.key_hash IS 'SHA-256 hash of the key (never store plaintext)';
COMMENT ON COLUMN api_keys.scope IS 'Permission scope: full, read_only, write_only';

-- ============================================================
-- 28. SESSIONS
-- ============================================================
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX idx_sessions_is_active ON sessions(is_active);

COMMENT ON TABLE sessions IS 'Active user sessions for web console access.';
COMMENT ON COLUMN sessions.token_hash IS 'SHA-256 of session token';

-- ============================================================
-- 29. REQUEST_LOGS
-- ============================================================
CREATE TABLE request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    model_id UUID REFERENCES models(id) ON DELETE SET NULL,
    virtual_model_id UUID REFERENCES virtual_models(id) ON DELETE SET NULL,
    prompt_registry_id UUID REFERENCES prompt_registries(id) ON DELETE SET NULL,
    mcp_server_id UUID REFERENCES mcp_servers(id) ON DELETE SET NULL,
    guardrail_profile_id UUID REFERENCES guardrail_profiles(id) ON DELETE SET NULL,
    matched_rule_id UUID REFERENCES virtual_model_rules(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    method VARCHAR(10) NOT NULL,
    path VARCHAR(500) NOT NULL,
    status_code INTEGER,
    input_tokens BIGINT NOT NULL DEFAULT 0,
    output_tokens BIGINT NOT NULL DEFAULT 0,
    cached_tokens BIGINT NOT NULL DEFAULT 0,
    cost DECIMAL(18,6) NOT NULL DEFAULT 0.00,
    latency_ms INTEGER,
    request_headers JSONB NOT NULL DEFAULT '{}',
    response_headers JSONB NOT NULL DEFAULT '{}',
    error_message TEXT,
    trace_id VARCHAR(100),
    region VARCHAR(50)
);

CREATE INDEX idx_request_logs_request_id ON request_logs(request_id);
CREATE INDEX idx_request_logs_user_id ON request_logs(user_id);
CREATE INDEX idx_request_logs_api_key_id ON request_logs(api_key_id);
CREATE INDEX idx_request_logs_model_id ON request_logs(model_id);
CREATE INDEX idx_request_logs_virtual_model_id ON request_logs(virtual_model_id);
CREATE INDEX idx_request_logs_started_at ON request_logs(started_at);
CREATE INDEX idx_request_logs_trace_id ON request_logs(trace_id);
CREATE INDEX idx_request_logs_status_code ON request_logs(status_code);
CREATE INDEX idx_request_logs_guardrail_profile_id ON request_logs(guardrail_profile_id);
CREATE INDEX idx_request_logs_matched_rule_id ON request_logs(matched_rule_id);

COMMENT ON TABLE request_logs IS 'Comprehensive request audit trail.';
COMMENT ON COLUMN request_logs.matched_rule_id IS 'Rule that selected model (for audit)';
COMMENT ON COLUMN request_logs.trace_id IS 'Distributed tracing ID';

-- ============================================================
-- 30. GUARDRAIL_VIOLATIONS
-- ============================================================
CREATE TABLE guardrail_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES request_logs(id) ON DELETE CASCADE,
    guardrail_profile_id UUID NOT NULL REFERENCES guardrail_profiles(id) ON DELETE CASCADE,
    rule_type VARCHAR(20) NOT NULL CHECK (rule_type IN ('content', 'pii', 'topic', 'rate', 'custom')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    triggered_content_snippet TEXT,
    action_taken VARCHAR(20) NOT NULL CHECK (action_taken IN ('block', 'warn', 'mask', 'log', 'allow')),
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_guardrail_violations_request_id ON guardrail_violations(request_id);
CREATE INDEX idx_guardrail_violations_guardrail_profile_id ON guardrail_violations(guardrail_profile_id);
CREATE INDEX idx_guardrail_violations_rule_type ON guardrail_violations(rule_type);
CREATE INDEX idx_guardrail_violations_severity ON guardrail_violations(severity);
CREATE INDEX idx_guardrail_violations_triggered_at ON guardrail_violations(triggered_at);

COMMENT ON TABLE guardrail_violations IS 'Recorded guardrail policy breaches.';
COMMENT ON COLUMN guardrail_violations.severity IS 'Impact: low, medium, high, critical';
COMMENT ON COLUMN guardrail_violations.action_taken IS 'Response: block, warn, mask, log, allow';

-- ============================================================
-- FOREIGN KEY CONSTRAINTS FOR BUDGET_CONSUMPTIONS
-- ============================================================
ALTER TABLE budget_consumptions
    ADD CONSTRAINT fk_budget_consumptions_request_logs
    FOREIGN KEY (request_id) REFERENCES request_logs(request_id) ON DELETE CASCADE;

-- ============================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- User budget summary
CREATE VIEW v_user_budget_summary AS
SELECT
    ub.id,
    ub.user_id,
    u.name AS user_name,
    u.email,
    r.name AS role_name,
    b.name AS budget_name,
    b.currency,
    ub.allocated_amount,
    ub.consumed_amount,
    ub.remaining_amount,
    ub.status,
    ub.allocated_at,
    ub.reset_at
FROM user_budgets ub
JOIN users u ON ub.user_id = u.id
JOIN role_budgets rb ON ub.role_budget_id = rb.id
JOIN roles r ON rb.role_id = r.id
JOIN budgets b ON ub.budget_id = b.id;

-- Request analytics
CREATE VIEW v_request_analytics AS
SELECT
    rl.id,
    rl.request_id,
    rl.user_id,
    u.name AS user_name,
    rl.model_id,
    m.name AS model_name,
    rl.virtual_model_id,
    vm.name AS virtual_model_name,
    rl.matched_rule_id,
    vmr.rule_type,
    rl.input_tokens,
    rl.output_tokens,
    rl.cached_tokens,
    rl.cost,
    rl.latency_ms,
    rl.status_code,
    rl.started_at,
    rl.completed_at,
    rl.region
FROM request_logs rl
LEFT JOIN users u ON rl.user_id = u.id
LEFT JOIN models m ON rl.model_id = m.id
LEFT JOIN virtual_models vm ON rl.virtual_model_id = vm.id
LEFT JOIN virtual_model_rules vmr ON rl.matched_rule_id = vmr.id;

-- Guardrail violation summary
CREATE VIEW v_guardrail_summary AS
SELECT
    gv.id,
    gv.request_id,
    rl.user_id,
    u.name AS user_name,
    gv.guardrail_profile_id,
    gp.name AS guardrail_name,
    gv.rule_type,
    gv.severity,
    gv.action_taken,
    gv.triggered_at
FROM guardrail_violations gv
JOIN request_logs rl ON gv.request_id = rl.id
JOIN users u ON rl.user_id = u.id
JOIN guardrail_profiles gp ON gv.guardrail_profile_id = gp.id;
