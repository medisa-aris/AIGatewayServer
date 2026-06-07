/**
 * Type definitions.
 *
 * 1. Resource row interfaces — mirror the central-server catalog columns.
 *    PostgreSQL NUMERIC/JSONB columns arrive over JSON as strings/objects;
 *    numeric-looking fields are typed `number | string` and must be coerced
 *    with Number() before arithmetic.
 * 2. Envelope types for list/single responses.
 * 3. Auth/session shapes used by the BFF.
 */

/** Standard list envelope returned by central-server (and the BFF proxy). */
export interface ListResponse<T> {
  data: T[];
  limit: number;
  offset: number;
}

/** Single-resource envelope. */
export interface ItemResponse<T> {
  data: T;
}

export type Json = Record<string, unknown>;
/** PostgreSQL NUMERIC columns serialize as strings; coerce with Number(). */
export type Numeric = number | string;

/* ----------------------------- Core resources ----------------------------- */

export interface Organization {
  id: string;
  name: string;
  slug: string;
  tier: string | null;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  settings: Json | null;
  billing_email: string | null;
}

export interface User {
  id: string;
  org_id: string;
  email: string;
  name: string;
  auth_provider: string | null;
  external_id: string | null;
  last_login_at: string | null;
  is_active: boolean;
}

export interface Role {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  scope: string | null;
  is_system: boolean;
  is_active: boolean;
  created_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  resource: string;
  action: string;
  condition: Json | null;
  is_active: boolean;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  granted_by: string | null;
  granted_at: string;
  expires_at: string | null;
  context: Json | null;
}

export interface ApiKey {
  id: string;
  user_id: string;
  org_id: string;
  key_hash: string;
  name: string;
  scope: string | null;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  permissions: Json | null;
}

export interface Model {
  id: string;
  org_id: string;
  provider_id: string | null;
  model_id: string;
  name: string;
  modality: string | null;
  capabilities: Json | null;
  max_tokens: number | null;
  context_window: number | null;
  deployment_name: string | null;
  is_active: boolean;
  created_at: string;
}

/** Provider type discriminator — matches the CHECK constraint in provider_accounts. */
export type ProviderType =
  | 'openai' | 'anthropic' | 'azure' | 'google' | 'aws'
  | 'mistral' | 'moonshot' | 'qwen' | 'perplexity' | 'ollama';

/** One configured upstream provider account per org. api_key is masked in GET responses. */
export interface ProviderAccount {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  provider_type: ProviderType;
  /** Masked by BFF: last 4 chars only (e.g. "...a3b4"). Null if not set or Ollama. */
  api_key: string | null;
  endpoint_url: string | null;
  region: string | null;
  /** Provider-specific extras: { resource_name?, api_version?, project_id? } */
  extra_config: Json | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Proxy on/off state for an organisation. One row per org. */
export interface ProxySettings {
  id: string;
  org_id: string;
  is_enabled: boolean;
  bind_address: string;
  created_at: string;
  updated_at: string;
}

/** API dialect — determines the HTTP format the proxy endpoint speaks. */
export type ProxyDialect = 'openai' | 'anthropic' | 'ollama' | 'azure';

/** A single local proxy port forwarding to a provider account or virtual model. */
export interface ProxyEndpoint {
  id: string;
  org_id: string;
  provider_account_id: string | null;
  /** Routing target discriminator — 'virtual_model' is only valid when dialect = 'ollama'. */
  target_type: 'provider_account' | 'virtual_model';
  /** Target virtual model when target_type = 'virtual_model'; null otherwise. */
  virtual_model_id: string | null;
  dialect: ProxyDialect;
  port: number;
  session_ttl: number;
  name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ── Proxy Services junction types (migration 013) ─────────────────────────── */

export interface UserProxyEndpoint { id: string; user_id: string; proxy_endpoint_id: string; created_at: string; }
export interface UserMcpServer     { id: string; user_id: string; mcp_server_id: string;       created_at: string; }
export interface UserSkill         { id: string; user_id: string; skill_id: string;             created_at: string; }
export interface UserGuardrail     { id: string; user_id: string; guardrail_profile_id: string; created_at: string; }
export interface OrgProxyEndpoint  { id: string; org_id:  string; proxy_endpoint_id: string;   created_at: string; }
export interface OrgMcpServer      { id: string; org_id:  string; mcp_server_id: string;       created_at: string; }
export interface OrgSkill          { id: string; org_id:  string; skill_id: string;             created_at: string; }
export interface OrgGuardrail      { id: string; org_id:  string; guardrail_profile_id: string; created_at: string; }

export interface ModelVersion {
  id: string;
  model_id: string;
  version: string;
  deployment_status: string | null;
  config: Json | null;
  released_at: string | null;
}

export interface PricingTier {
  id: string;
  model_id: string;
  tier_name: string;
  input_price: Numeric;
  output_price: Numeric;
  cached_price: Numeric | null;
  currency: string;
  effective_from: string | null;
  effective_to: string | null;
}

export interface VirtualModel {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  default_model_id: string | null;
  is_active: boolean;
  created_at: string;
  routing_config: Json | null;
}

export interface VirtualModelRoutingConfig {
  auto_route: boolean;
  decision_engine: 'classifier' | 'rule-based' | 'rules-classifier';
  fallback_enabled: boolean;
  fallback_chain: string[];
  classifier_model_id: string | null;
}

export interface VirtualModelRule {
  id: string;
  virtual_model_id: string;
  target_model_id: string;
  priority: number;
  rule_type: string;
  condition: Json | null;
  parameters: Json | null;
  is_active: boolean;
  created_at: string;
}

export interface PromptRegistry {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: string | null;
  category: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
}

export interface PromptVersion {
  id: string;
  registry_id: string;
  author_id: string | null;
  version_number: number;
  prompt_template: string;
  variables: Json | null;
  metadata: Json | null;
  status: string;
  created_at: string;
}

export interface PromptDeployment {
  id: string;
  version_id: string;
  deployed_by: string | null;
  endpoint_alias: string | null;
  runtime_config: Json | null;
  is_active: boolean;
  deployed_at: string | null;
}

export interface McpServer {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  transport: string | null;
  endpoint_url: string | null;
  auth_config: Json | null;
  status: string | null;
  is_active: boolean;
  created_at: string;
}

export interface McpTool {
  id: string;
  mcp_server_id: string;
  name: string;
  description: string | null;
  input_schema: Json | null;
  is_active: boolean;
}

export interface McpCapability {
  id: string;
  mcp_server_id: string;
  capability_type: string;
  config: Json | null;
}

export interface GuardrailProfile {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  /** 'organization' | 'individual' — kind of entity this profile is assigned to */
  entity_type: string | null;
  /** Polymorphic UUID: organizations.id or users.id depending on entity_type */
  entity_id: string | null;
  /** FK → budgets.id — at most one budget per profile */
  budget_id: string | null;
  /** FK → rate_limits.id — at most one rate-limit rule per profile */
  rate_limit_id: string | null;
  content_policy: Json | null;
  pii_rules: Json | null;
  topic_filters: Json | null;
  rate_limits: Json | null;
  custom_rules: Json | null;
  is_active: boolean;
  created_at: string;
}

/** Junction row: one PII object attached to a guardrail profile. */
export interface GuardrailProfilePiiObject {
  id: string;
  guardrail_profile_id: string;
  pii_object_id: string;
  created_at: string;
}

export interface GuardrailViolation {
  id: string;
  request_id: string | null;
  guardrail_profile_id: string;
  rule_type: string;
  severity: string | null;
  triggered_content_snippet: string | null;
  action_taken: string | null;
  triggered_at: string;
  metadata: Json | null;
}

export interface Budget {
  id: string;
  org_id: string;
  name: string;
  total_amount: Numeric;
  remaining_amount: Numeric;
  currency: string;
  period: string | null;
  period_start: string | null;
  period_end: string | null;
  is_active: boolean;
  is_shared: boolean;
}

export interface BudgetConsumption {
  id: string;
  user_budget_id: string | null;
  user_id: string | null;
  request_id: string | null;
  amount: Numeric;
  currency: string;
  usage_type: string | null;
  quantity: Numeric | null;
  consumed_at: string;
  status: string | null;
}

export interface UserBudget {
  id: string;
  user_id: string;
  role_budget_id: string | null;
  budget_id: string | null;
  allocated_amount: Numeric;
  consumed_amount: Numeric;
  remaining_amount: Numeric;
  status: string | null;
  allocated_at: string | null;
  reset_at: string | null;
}

export interface RequestLog {
  id: string;
  request_id: string;
  user_id: string | null;
  api_key_id: string | null;
  model_id: string | null;
  virtual_model_id: string | null;
  prompt_registry_id: string | null;
  mcp_server_id: string | null;
  guardrail_profile_id: string | null;
  matched_rule_id: string | null;
  started_at: string;
  completed_at: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost: Numeric | null;
  latency_ms: number | null;
  request_headers: Json | null;
  response_headers: Json | null;
  error_message: string | null;
  trace_id: string | null;
  region: string | null;
}

export interface Session {
  id: string;
  user_id: string;
  token_hash: string;
  ip_address: string | null;
  user_agent: string | null;
  started_at: string;
  expires_at: string | null;
  last_activity_at: string | null;
  is_active: boolean;
}

/* ----------------------------- Route-test trace ----------------------------- */

/**
 * One step in the dry-run routing/guardrail validation trace.
 *
 * status values mirror the Go constants:
 *   'pass'  — the check succeeded (green in the trace UI)
 *   'fail'  — a mandatory check failed; Allowed is set to false (red)
 *   'warn'  — a non-blocking finding, e.g. PII that will be masked (amber)
 *   'skip'  — the check did not apply, e.g. no endpoint supplied (grey)
 */
export interface RouteTestCheck {
  step:     string;
  status:   'pass' | 'fail' | 'warn' | 'skip';
  message:  string;
  details?: Record<string, unknown>;
}

/**
 * Full report returned by POST /api/v1/route-test (and the BFF proxy at
 * POST /api/route-test). The checks array is ordered and designed to render
 * directly as a step-by-step trace.
 */
export interface RouteTestReport {
  allowed:    boolean;
  user_id?:   string;
  user_name?: string;
  org_id?:    string;
  org_name?:  string;
  checks:     RouteTestCheck[];
}

/* ----- Migration-001 resources ----- */

export interface PiiObject {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  detection_method: string;
  pattern: string | null;
  masking_style: string;
  replacement_text: string | null;
  min_confidence: Numeric;
  is_active: boolean;
  created_at: string;
}

export interface RateLimit {
  id: string;
  org_id: string;
  name: string;
  scope: string;
  scope_id: string | null;
  limit_type: string;
  limit_value: number;
  window_seconds: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface Skill {
  id: string;
  org_id: string;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  frontmatter: Json | null;
  body: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Design-only fields the `skills` table has no columns for, stashed in the
 * `frontmatter` JSONB so the Skills Registry widgets/cards stay live. `versions`
 * and `attachments` have no backing version-history/agents table — they are
 * tracked here and written by the create/edit form.
 */
export interface SkillFrontmatter {
  tags?: string[];
  preload?: boolean;
  versions?: number;
  attachments?: number;
}

export interface RoleSkill {
  id: string;
  role_id: string;
  skill_id: string;
  access_level: string;
  can_invoke: boolean;
  can_edit: boolean;
  granted_at: string;
}

/* ----- Role link tables (CRUD via generic FormModal) ----- */
export interface RoleModel { id: string; role_id: string; model_id: string; access_level: string; can_fine_tune: boolean; max_quota_per_request: number | null; }
export interface RoleMcp { id: string; role_id: string; mcp_server_id: string; access_level: string; can_configure: boolean; allowed_tools: Json | null; allowed_resources: Json | null; }
export interface RoleBudget { id: string; role_id: string; budget_id: string; max_budget_per_user: Numeric | null; max_budget_per_request: Numeric | null; spend_scope: string | null; can_override: boolean; }
export interface RoleGuardrail { id: string; role_id: string; guardrail_profile_id: string; is_mandatory: boolean; can_bypass: boolean; bypass_approval: string | null; }
export interface RolePromptRegistry { id: string; role_id: string; prompt_registry_id: string; access_level: string; can_fork: boolean; can_deploy: boolean; }
export interface RoleVirtualModel { id: string; role_id: string; virtual_model_id: string; access_level: string; can_modify_routing: boolean; }

/* ----------------------------- RouteRequest / RouteLogs ----------------------------- */

/** One row from the route_logs table — full audit of a live RouteRequest execution. */
export interface RouteLog {
  id: string;
  request_id: string;
  user_id: string | null;
  org_id: string | null;
  api_key_id: string | null;
  proxy_endpoint_id: string | null;
  provider_account_id: string | null;
  model_id: string | null;
  mcp_server_id: string | null;
  message_inquiry: string;
  message_request: string;
  message_output: string | null;
  pipeline_checks: RouteTestCheck[];
  guardrail_violation_ids: string[];
  status: 'allowed' | 'blocked' | 'error';
  prompt_tokens: number;
  completion_tokens: number;
  cost: Numeric;
  latency_ms: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

/** Request body sent to POST /api/route-request (BFF). */
export interface RouteRequestBody {
  apiKey: string;
  message: string;
  endpointId: string;
  mcpServerId?: string;
}

/** Response from POST /api/v1/route-request (mirrored by the BFF). */
export interface RouteRequestResult {
  route_log_id: string;
  request_id: string;
  allowed: boolean;
  status: 'allowed' | 'blocked' | 'error';
  output?: string;
  checks: RouteTestCheck[];
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency_ms: number;
  error_message?: string;
}

/* ----------------------------- Auth ----------------------------- */

export interface SessionUser {
  userId: string;
  orgId: string;
  name: string;
  email: string;
  orgName?: string;
}
