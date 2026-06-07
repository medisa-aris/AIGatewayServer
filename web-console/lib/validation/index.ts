/**
 * Shared resource validation.
 *
 * Used in two places:
 *  - the BFF proxy (POST/PATCH) — the enforcement point, since central-server
 *    has no validation middleware;
 *  - client forms — for inline field errors before submit.
 *
 * On PATCH (isUpdate=true) only the fields present in the body are validated,
 * so partial updates are allowed.
 */

export interface FieldError {
  field: string;
  error: string;
}
export type ValidationResult = FieldError | null;
type Body = Record<string, unknown>;
type Validator = (b: Body, isUpdate: boolean) => ValidationResult;

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;

const has = (b: Body, k: string) => Object.prototype.hasOwnProperty.call(b, k);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

/** Require a field on create; if present on update, it still must be non-blank. */
function required(b: Body, isUpdate: boolean, field: string, label?: string): ValidationResult {
  if (!isUpdate && !has(b, field)) return { field, error: `${label ?? field} is required` };
  if (has(b, field) && isBlank(b[field])) return { field, error: `${label ?? field} is required` };
  return null;
}

function oneOf(b: Body, field: string, allowed: string[], label?: string): ValidationResult {
  if (has(b, field) && !isBlank(b[field]) && !allowed.includes(str(b[field]))) {
    return { field, error: `${label ?? field} must be one of: ${allowed.join(', ')}` };
  }
  return null;
}

function numberRange(
  b: Body,
  field: string,
  opts: { min?: number; max?: number; integer?: boolean; gt?: number },
  label?: string,
): ValidationResult {
  if (!has(b, field) || isBlank(b[field])) return null;
  const n = Number(b[field]);
  if (Number.isNaN(n)) return { field, error: `${label ?? field} must be a number` };
  if (opts.integer && !Number.isInteger(n)) return { field, error: `${label ?? field} must be an integer` };
  if (opts.gt != null && !(n > opts.gt)) return { field, error: `${label ?? field} must be greater than ${opts.gt}` };
  if (opts.min != null && n < opts.min) return { field, error: `${label ?? field} must be ≥ ${opts.min}` };
  if (opts.max != null && n > opts.max) return { field, error: `${label ?? field} must be ≤ ${opts.max}` };
  return null;
}

function slug(b: Body, field = 'slug'): ValidationResult {
  if (has(b, field) && !isBlank(b[field]) && !SLUG_RE.test(str(b[field]))) {
    return { field, error: 'must be lowercase letters, numbers and dashes' };
  }
  return null;
}

/** Chains validators, returning the first error. */
function chain(...checks: (ValidationResult)[]): ValidationResult {
  for (const c of checks) if (c) return c;
  return null;
}

const validators: Record<string, Validator> = {
  organizations: (b, u) =>
    chain(
      required(b, u, 'name'),
      required(b, u, 'slug'),
      slug(b),
      has(b, 'billing_email') && !isBlank(b.billing_email) && !EMAIL_RE.test(str(b.billing_email))
        ? { field: 'billing_email', error: 'must be a valid email' }
        : null,
    ),

  users: (b, u) =>
    chain(
      required(b, u, 'email'),
      has(b, 'email') && !isBlank(b.email) && !EMAIL_RE.test(str(b.email)) ? { field: 'email', error: 'must be a valid email' } : null,
      required(b, u, 'name'),
      oneOf(b, 'auth_provider', ['local', 'entra', 'ad', 'oidc', 'ldap', 'virtual_account']),
    ),

  roles: (b, u) => chain(required(b, u, 'name'), oneOf(b, 'scope', ['org', 'global', 'project'])),

  'role-permissions': (b, u) =>
    chain(required(b, u, 'role_id'), required(b, u, 'resource'), required(b, u, 'action')),

  'user-roles': (b, u) => chain(required(b, u, 'user_id'), required(b, u, 'role_id')),

  'api-keys': (b, u) =>
    chain(required(b, u, 'name'), required(b, u, 'key_hash'), required(b, u, 'user_id'), required(b, u, 'org_id')),

  'provider-accounts': (b, u) =>
    chain(
      required(b, u, 'name'),
      required(b, u, 'slug'),
      slug(b),
      required(b, u, 'provider_type'),
      oneOf(b, 'provider_type', ['openai', 'anthropic', 'azure', 'google', 'aws', 'mistral', 'moonshot', 'qwen', 'perplexity', 'ollama']),
      // Ollama needs an endpoint, not an API key
      str(b.provider_type) === 'ollama' && !u && isBlank(b.endpoint_url)
        ? { field: 'endpoint_url', error: 'endpoint URL is required for Ollama' }
        : null,
      has(b, 'endpoint_url') && !isBlank(b.endpoint_url) && !isUrl(str(b.endpoint_url))
        ? { field: 'endpoint_url', error: 'must be a valid URL (e.g. http://localhost:11434)' }
        : null,
    ),

  models: (b, u) =>
    chain(
      required(b, u, 'model_id'),
      required(b, u, 'name'),
      oneOf(b, 'modality', ['text', 'embedding', 'image', 'audio', 'multimodal']),
      numberRange(b, 'max_tokens', { integer: true, gt: 0 }),
      numberRange(b, 'context_window', { integer: true, gt: 0 }),
    ),

  'virtual-models': (b, u) => chain(required(b, u, 'name'), required(b, u, 'slug'), slug(b)),

  'virtual-model-rules': (b, u) =>
    chain(required(b, u, 'virtual_model_id'), required(b, u, 'target_model_id'), numberRange(b, 'priority', { integer: true })),

  'guardrail-profiles': (b, u) => required(b, u, 'name'),

  'pii-objects': (b, u) =>
    chain(
      required(b, u, 'name'),
      oneOf(b, 'detection_method', ['regex', 'ner', 'llm', 'dict']),
      // pattern required iff detection_method === 'regex'
      str(b.detection_method) === 'regex' && isBlank(b.pattern)
        ? { field: 'pattern', error: 'pattern is required for regex detection' }
        : null,
      validRegex(b),
      oneOf(b, 'masking_style', ['redact', 'replace', 'hash', 'partial']),
      str(b.masking_style) === 'replace' && has(b, 'replacement_text') && isBlank(b.replacement_text)
        ? { field: 'replacement_text', error: 'replacement text is required for replace masking' }
        : null,
      numberRange(b, 'min_confidence', { min: 0, max: 1 }),
    ),

  'prompt-registries': (b, u) => chain(required(b, u, 'name'), required(b, u, 'slug'), slug(b), oneOf(b, 'visibility', ['private', 'org', 'public'])),

  'prompt-versions': (b, u) => chain(required(b, u, 'registry_id'), required(b, u, 'prompt_template')),

  budgets: (b, u) =>
    chain(
      required(b, u, 'name'),
      numberRange(b, 'total_amount', { gt: 0 }),
      oneOf(b, 'period', ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
      periodOrder(b),
    ),

  'rate-limits': (b, u) =>
    chain(
      required(b, u, 'name'),
      oneOf(b, 'scope', ['global', 'org', 'role', 'user']),
      str(b.scope) && str(b.scope) !== 'global' && isBlank(b.scope_id)
        ? { field: 'scope_id', error: 'scope target is required unless scope is global' }
        : null,
      oneOf(b, 'limit_type', ['rpm', 'tpm', 'rpd', 'tpd']),
      numberRange(b, 'limit_value', { integer: true, gt: 0 }),
      numberRange(b, 'window_seconds', { integer: true, gt: 0 }),
      numberRange(b, 'priority', { integer: true }),
    ),

  'mcp-servers': (b, u) =>
    chain(
      required(b, u, 'name'),
      required(b, u, 'slug'),
      slug(b),
      oneOf(b, 'transport', ['http', 'sse', 'stdio', 'websocket']),
      has(b, 'endpoint_url') && !isBlank(b.endpoint_url) && !isUrl(str(b.endpoint_url))
        ? { field: 'endpoint_url', error: 'must be a valid URL' }
        : null,
    ),

  'mcp-tools': (b, u) => chain(required(b, u, 'mcp_server_id'), required(b, u, 'name'), validJson(b, 'input_schema')),

  skills: (b, u) =>
    chain(
      required(b, u, 'name'),
      required(b, u, 'slug'),
      slug(b),
      has(b, 'version') && !isBlank(b.version) && !SEMVER_RE.test(str(b.version)) ? { field: 'version', error: 'must be semver (e.g. 1.0.0)' } : null,
      oneOf(b, 'status', ['draft', 'published', 'deprecated']),
    ),

  'role-skills': (b, u) => chain(required(b, u, 'role_id'), required(b, u, 'skill_id'), oneOf(b, 'access_level', ['use', 'manage'])),

  // Added by migration 003
  'proxy-settings': (b, u) => chain(required(b, u, 'org_id')),

  'proxy-endpoints': (b, u) =>
    chain(
      required(b, u, 'org_id'),
      required(b, u, 'dialect'),
      oneOf(b, 'dialect', ['openai', 'anthropic', 'ollama', 'azure']),
      numberRange(b, 'port', { integer: true, min: 1024, max: 65535 }),
      numberRange(b, 'session_ttl', { integer: true, gt: 0 }),
      oneOf(b, 'target_type', ['provider_account', 'virtual_model']),
    ),
};

function validRegex(b: Body): ValidationResult {
  if (str(b.detection_method) === 'regex' && !isBlank(b.pattern)) {
    try {
      new RegExp(str(b.pattern));
    } catch {
      return { field: 'pattern', error: 'invalid regular expression' };
    }
  }
  return null;
}

function periodOrder(b: Body): ValidationResult {
  if (!isBlank(b.period_start) && !isBlank(b.period_end)) {
    if (new Date(str(b.period_start)) >= new Date(str(b.period_end))) {
      return { field: 'period_end', error: 'period end must be after period start' };
    }
  }
  return null;
}

function validJson(b: Body, field: string): ValidationResult {
  if (has(b, field) && typeof b[field] === 'string' && !isBlank(b[field])) {
    try {
      JSON.parse(str(b[field]));
    } catch {
      return { field, error: 'must be valid JSON' };
    }
  }
  return null;
}

function isUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates a resource payload. Unknown resources pass (the generic proxy still
 * forwards them); known resources enforce the rules above.
 */
export function validate(resource: string, body: Body, isUpdate: boolean): ValidationResult {
  const v = validators[resource];
  return v ? v(body, isUpdate) : null;
}
