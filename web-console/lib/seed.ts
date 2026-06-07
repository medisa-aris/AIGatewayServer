/**
 * Seed / fallback data — ported from the design's data.jsx (Super-Admin,
 * enterprise-scale persona). Screens use live BFF data first and fall back to
 * this so the UI renders instantly and never blanks when a resource is empty
 * or the upstream is briefly unreachable. Much of this (aggregate richness,
 * provider accounts, auth providers) has no CRUD equivalent in central-server.
 */

/* seeded RNG for stable charts */
function mulberry(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function series(seed: number, n: number, base: number, vol: number, trend = 0, floor = 0): number[] {
  const r = mulberry(seed);
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * vol + trend;
    if (v < floor) v = floor;
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}
export function wave(seed: number, n: number, base: number, amp: number, vol: number): number[] {
  const r = mulberry(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(Math.max(0, Math.round(base + Math.sin((i / n) * Math.PI * 2) * amp + (r() - 0.5) * vol)));
  }
  return out;
}

export const hours24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00');
export const days30 = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(2026, 4, i + 4);
  return d.getMonth() + 1 + '/' + d.getDate();
});
export const days14 = days30.slice(-14);

export const SEED = {
  series,
  wave,
  hours24,
  days30,
  days14,

  user: { name: 'Avery Sembiring', email: 'avery.sembiring@pangreksa.io', role: 'Super Admin', initials: 'AS', org: 'Pangreksa Platform' },

  overview: {
    kpis: {
      cost: { value: '$184.2', unit: 'k', delta: '12.4% vs last 30d', dir: 'up', spark: series(11, 30, 4000, 800, 60) },
      llmCalls: { value: '48.6', unit: 'M', delta: '8.1%', dir: 'up', spark: series(22, 30, 1.4e6, 2e5, 1e4) },
      mcpCalls: { value: '3.21', unit: 'M', delta: '21.7%', dir: 'up', spark: series(33, 30, 90000, 18000, 1500) },
      errorRate: { value: '0.42', unit: '%', delta: '0.11 pts', dir: 'down', spark: series(44, 30, 0.6, 0.12, -0.004) },
      cacheHit: { value: '37.8', unit: '%', delta: '4.2 pts', dir: 'up', spark: series(55, 30, 30, 3, 0.3) },
      p95: { value: '842', unit: 'ms', delta: '63 ms', dir: 'down', spark: series(66, 30, 950, 60, -3) },
    },
    costTrend: {
      labels: days30,
      series: [
        { name: 'OpenAI', data: series(101, 30, 1700, 260, 8) },
        { name: 'Anthropic', data: series(102, 30, 1450, 240, 10) },
        { name: 'Google Vertex', data: series(103, 30, 640, 120, 4) },
        { name: 'AWS Bedrock', data: series(104, 30, 420, 90, 2) },
      ],
    },
    requestsByEndpoint: [
      { label: '/chat/completions', value: 38200000 },
      { label: '/embeddings', value: 6100000 },
      { label: '/messages', value: 2700000 },
      { label: '/responses', value: 980000 },
      { label: '/audio/*', value: 410000 },
      { label: '/images/*', value: 190000 },
    ],
    errorBreakdown: [
      { label: '429 Rate limited', value: 18400 },
      { label: '503 Upstream', value: 9200 },
      { label: '500 Provider', value: 6100 },
      { label: '400 Bad request', value: 14800 },
      { label: '408 Timeout', value: 3300 },
    ],
    callsTrend: {
      labels: days14,
      series: [
        { name: 'LLM calls', data: series(201, 14, 1.55e6, 1.6e5, 8000) },
        { name: 'MCP calls', data: series(202, 14, 98000, 16000, 1200) },
      ],
    },
    hourly: wave(301, 24, 1400, 700, 160),
    topModels: [
      { label: 'gpt-4o', value: 14200000, color: '#1192e8' },
      { label: 'claude-sonnet-4.5', value: 11800000, color: '#0f62fe' },
      { label: 'gpt-4o-mini', value: 9300000, color: '#6929c4' },
      { label: 'gemini-2.5-pro', value: 5100000, color: '#009d9a' },
      { label: 'claude-haiku-4', value: 3900000, color: '#ee538b' },
      { label: 'text-embedding-3-large', value: 4300000, color: '#a56eff' },
    ],
    topProviders: [
      { label: 'OpenAI', value: 31.4 },
      { label: 'Anthropic', value: 28.9 },
      { label: 'Google Vertex', value: 14.2 },
      { label: 'AWS Bedrock', value: 9.1 },
      { label: 'Mistral', value: 6.4 },
      { label: 'Groq', value: 5.2 },
      { label: 'Others', value: 4.8 },
    ],
    topUsers: [
      { label: 'platform-svc', value: 9.2e6 },
      { label: 'data-pipeline', value: 7.1e6 },
      { label: 'web-app-prod', value: 6.4e6 },
      { label: 'agent-runtime', value: 5.8e6 },
      { label: 'analytics-team', value: 3.2e6 },
      { label: 'support-bot', value: 2.9e6 },
    ],
    guardrailSummary: {
      flagged: 24800,
      mutated: 18200,
      blocked: 6600,
      rankings: [
        { label: 'PII Redaction', value: 9800, color: '#1192e8' },
        { label: 'Prompt Injection', value: 6100, color: '#fa4d56' },
        { label: 'Content Moderation', value: 4200, color: '#b28600' },
        { label: 'Secrets Detection', value: 2900, color: '#6929c4' },
        { label: 'SQL Sanitization', value: 1800, color: '#009d9a' },
      ],
    },
    topMcp: [
      { label: 'github', value: 880000 },
      { label: 'slack', value: 640000 },
      { label: 'snowflake', value: 410000 },
      { label: 'salesforce', value: 380000 },
      { label: 'airtable', value: 210000 },
    ],
  },

  models: [
    { id: 'gpt-4o', name: 'gpt-4o', provider: 'OpenAI', vm: 'vm/general-chat', reqs: 14200000, inTok: 3.1e9, outTok: 8.2e8, cost: 62400, p50: 540, p75: 720, p90: 980, p99: 1840, fail: 0.31, status: 'ok' },
    { id: 'claude-sonnet-4.5', name: 'claude-sonnet-4.5', provider: 'Anthropic', vm: 'vm/general-chat', reqs: 11800000, inTok: 2.8e9, outTok: 9.1e8, cost: 58100, p50: 610, p75: 810, p90: 1120, p99: 2240, fail: 0.28, status: 'ok' },
    { id: 'gpt-4o-mini', name: 'gpt-4o-mini', provider: 'OpenAI', vm: 'vm/fast-tier', reqs: 9300000, inTok: 1.9e9, outTok: 4.1e8, cost: 8900, p50: 280, p75: 360, p90: 520, p99: 980, fail: 0.19, status: 'ok' },
    { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro', provider: 'Google Vertex', vm: 'vm/general-chat', reqs: 5100000, inTok: 1.4e9, outTok: 3.6e8, cost: 22300, p50: 680, p75: 910, p90: 1280, p99: 2680, fail: 0.44, status: 'warn' },
    { id: 'claude-haiku-4', name: 'claude-haiku-4', provider: 'Anthropic', vm: 'vm/fast-tier', reqs: 3900000, inTok: 8.1e8, outTok: 1.9e8, cost: 4100, p50: 240, p75: 310, p90: 460, p99: 880, fail: 0.16, status: 'ok' },
    { id: 'text-embedding-3-large', name: 'text-embedding-3-large', provider: 'OpenAI', vm: 'vm/embeddings', reqs: 4300000, inTok: 6.2e9, outTok: 0, cost: 8060, p50: 90, p75: 130, p90: 210, p99: 430, fail: 0.08, status: 'ok' },
    { id: 'mistral-large', name: 'mistral-large-2', provider: 'Mistral', vm: 'vm/general-chat', reqs: 1800000, inTok: 5.1e8, outTok: 1.4e8, cost: 5200, p50: 520, p75: 700, p90: 1010, p99: 2100, fail: 0.52, status: 'warn' },
    { id: 'llama-3.3-70b', name: 'llama-3.3-70b', provider: 'Groq', vm: 'vm/fast-tier', reqs: 2400000, inTok: 6.8e8, outTok: 1.7e8, cost: 3100, p50: 120, p75: 180, p90: 280, p99: 620, fail: 0.22, status: 'ok' },
  ],

  virtualModels: [
    { id: 'vm/general-chat', name: 'general-chat', strategy: 'weight-based', status: 'active', reqs: 32100000, fallbacks: 2, targets: [{ model: 'gpt-4o', provider: 'OpenAI', weight: 45 }, { model: 'claude-sonnet-4.5', provider: 'Anthropic', weight: 35 }, { model: 'gemini-2.5-pro', provider: 'Google Vertex', weight: 20 }] },
    { id: 'vm/fast-tier', name: 'fast-tier', strategy: 'latency-based', status: 'active', reqs: 15600000, fallbacks: 1, targets: [{ model: 'gpt-4o-mini', provider: 'OpenAI', weight: 0 }, { model: 'claude-haiku-4', provider: 'Anthropic', weight: 0 }, { model: 'llama-3.3-70b', provider: 'Groq', weight: 0 }] },
    { id: 'vm/embeddings', name: 'embeddings', strategy: 'priority-based', status: 'active', reqs: 4300000, fallbacks: 1, targets: [{ model: 'text-embedding-3-large', provider: 'OpenAI', weight: 0, priority: 0 }, { model: 'embed-multilingual-v3', provider: 'Cohere', weight: 0, priority: 1 }] },
    { id: 'vm/coding', name: 'coding-assistant', strategy: 'priority-based', status: 'active', reqs: 6800000, fallbacks: 2, targets: [{ model: 'claude-sonnet-4.5', provider: 'Anthropic', weight: 0, priority: 0 }, { model: 'gpt-4o', provider: 'OpenAI', weight: 0, priority: 1 }] },
    { id: 'vm/vision', name: 'vision-analysis', strategy: 'sticky', status: 'paused', reqs: 920000, fallbacks: 0, targets: [{ model: 'gpt-4o', provider: 'OpenAI', weight: 60 }, { model: 'gemini-2.5-pro', provider: 'Google Vertex', weight: 40 }] },
  ],

  providers: [
    { id: 'pa-openai', name: 'OpenAI Production', provider: 'OpenAI', models: 48, status: 'connected', region: 'us-east', keys: 3, spend: 62400, lastSync: '2 min ago' },
    { id: 'pa-anthropic', name: 'Anthropic Prod', provider: 'Anthropic', models: 12, status: 'connected', region: 'us-east', keys: 2, spend: 58100, lastSync: '1 min ago' },
    { id: 'pa-azure', name: 'Azure OpenAI EU', provider: 'Azure OpenAI', models: 31, status: 'connected', region: 'eu-west', keys: 4, spend: 24800, lastSync: '5 min ago' },
    { id: 'pa-vertex', name: 'Google Vertex', provider: 'Google Vertex', models: 22, status: 'connected', region: 'us-central', keys: 1, spend: 22300, lastSync: '3 min ago' },
    { id: 'pa-bedrock', name: 'AWS Bedrock', provider: 'AWS Bedrock', models: 64, status: 'degraded', region: 'us-west-2', keys: 2, spend: 14200, lastSync: '12 min ago' },
    { id: 'pa-mistral', name: 'Mistral Platform', provider: 'Mistral', models: 9, status: 'connected', region: 'eu-west', keys: 1, spend: 5200, lastSync: '4 min ago' },
    { id: 'pa-groq', name: 'Groq Cloud', provider: 'Groq', models: 7, status: 'connected', region: 'us-east', keys: 1, spend: 3100, lastSync: '2 min ago' },
    { id: 'pa-cohere', name: 'Cohere', provider: 'Cohere', models: 6, status: 'idle', region: 'us-east', keys: 1, spend: 980, lastSync: '1 hr ago' },
  ],

  prompts: [
    { repo: 'support', name: 'triage-classifier', versions: 14, latest: 14, model: 'claude-sonnet-4.5', updated: '2026-05-29', author: 'M. Tarigan', guardrails: 2, tag: 'production' },
    { repo: 'support', name: 'reply-drafter', versions: 8, latest: 8, model: 'gpt-4o', updated: '2026-05-30', author: 'M. Tarigan', guardrails: 1, tag: 'production' },
    { repo: 'sales', name: 'lead-enrichment', versions: 6, latest: 6, model: 'gpt-4o-mini', updated: '2026-05-27', author: 'D. Ginting', guardrails: 0, tag: 'staging' },
    { repo: 'agents', name: 'router-system', versions: 23, latest: 23, model: 'claude-sonnet-4.5', updated: '2026-06-01', author: 'A. Sembiring', guardrails: 3, tag: 'production' },
    { repo: 'agents', name: 'summarizer', versions: 11, latest: 11, model: 'gemini-2.5-pro', updated: '2026-05-31', author: 'A. Sembiring', guardrails: 1, tag: 'production' },
    { repo: 'data', name: 'sql-generator', versions: 5, latest: 5, model: 'gpt-4o', updated: '2026-05-24', author: 'R. Sinaga', guardrails: 2, tag: 'staging' },
  ],
  promptVersions: [
    { v: 23, label: 'latest', author: 'A. Sembiring', date: '2026-06-01 14:22', note: 'Tighten routing rules for code intents', current: true },
    { v: 22, author: 'A. Sembiring', date: '2026-05-30 09:10', note: 'Add fallback instruction for ambiguous queries' },
    { v: 21, author: 'D. Ginting', date: '2026-05-28 16:45', note: 'Adjust tone for enterprise tier' },
    { v: 20, author: 'A. Sembiring', date: '2026-05-26 11:30', note: 'Reduce token budget; trim examples' },
  ],

  mcpServers: [
    { id: 'github', name: 'GitHub', cat: 'Dev Tools', tools: 42, status: 'connected', auth: 'OAuth', calls: 880000, users: 34 },
    { id: 'slack', name: 'Slack', cat: 'Communication', tools: 28, status: 'connected', auth: 'OAuth', calls: 640000, users: 51 },
    { id: 'snowflake', name: 'Snowflake', cat: 'Data', tools: 18, status: 'connected', auth: 'Key Pair', calls: 410000, users: 12 },
    { id: 'salesforce', name: 'Salesforce', cat: 'CRM', tools: 35, status: 'connected', auth: 'OAuth', calls: 380000, users: 23 },
    { id: 'airtable', name: 'Airtable', cat: 'Productivity', tools: 14, status: 'connected', auth: 'API Key', calls: 210000, users: 18 },
    { id: 'jira', name: 'Jira', cat: 'Dev Tools', tools: 31, status: 'degraded', auth: 'OAuth', calls: 160000, users: 29 },
    { id: 'pagerduty', name: 'PagerDuty', cat: 'Ops', tools: 12, status: 'connected', auth: 'API Key', calls: 94000, users: 8 },
    { id: 'hubspot', name: 'HubSpot', cat: 'CRM', tools: 26, status: 'idle', auth: 'OAuth', calls: 0, users: 0 },
  ],
  catalog: ['Airtable', 'Slack', 'GitHub', 'Salesforce', 'HubSpot', 'Google Workspace', 'Atlassian', 'Snowflake', 'MongoDB', 'Datadog', 'PagerDuty', 'Zoom', 'Zendesk', 'Ramp', 'QuickBooks', 'Netsuite', 'Gong', 'DBT', 'Notion', 'Linear', 'Stripe', 'Twilio'],
  skills: [
    { name: 'sql-analyst', desc: 'Translate questions into validated SQL with schema awareness', tags: ['data', 'analytics'], versions: 7, preload: true, attached: 14 },
    { name: 'incident-responder', desc: 'Triage alerts, draft runbooks, and open tickets', tags: ['ops'], versions: 4, preload: false, attached: 8 },
    { name: 'code-reviewer', desc: 'Review diffs for safety, style, and correctness', tags: ['dev'], versions: 12, preload: true, attached: 22 },
    { name: 'doc-writer', desc: 'Produce structured technical documentation from context', tags: ['writing'], versions: 5, preload: false, attached: 11 },
  ],

  guardrails: [
    { id: 'pii', name: 'PII Redaction', type: 'PII Detection', provider: 'Azure AI Language', hook: 'llm_output', mode: 'Mutate', enforce: 'Enforce', status: 'active', triggers: 9800, p95: 42 },
    { id: 'inject', name: 'Prompt Injection Shield', type: 'Prompt Injection', provider: 'Azure Prompt Shield', hook: 'llm_input', mode: 'Block', enforce: 'Enforce', status: 'active', triggers: 6100, p95: 31 },
    { id: 'mod', name: 'Content Moderation', type: 'Content Moderation', provider: 'Azure Content Safety', hook: 'llm_input+output', mode: 'Block', enforce: 'Enforce-But-Ignore-On-Error', status: 'active', triggers: 4200, p95: 55 },
    { id: 'secrets', name: 'Secrets Detection', type: 'Secrets', provider: 'Built-in', hook: 'mcp_post_invoke', mode: 'Mutate', enforce: 'Enforce', status: 'active', triggers: 2900, p95: 18 },
    { id: 'sql', name: 'SQL Sanitization', type: 'SQL Injection', provider: 'Built-in', hook: 'mcp_pre_invoke', mode: 'Block', enforce: 'Audit', status: 'active', triggers: 1800, p95: 12 },
    { id: 'code', name: 'Code Safety Lint', type: 'Code Safety', provider: 'Built-in', hook: 'mcp_post_invoke', mode: 'Validate', enforce: 'Audit', status: 'paused', triggers: 0, p95: 0 },
  ],

  budgetRules: [
    { id: 'br-1', name: 'VIP override — platform team', per: 'user', limit: 50000, unit: 'cost_per_month', spent: 31200, audit: false, when: 'team = platform' },
    { id: 'br-2', name: 'Per-user monthly cap', per: 'user', limit: 2000, unit: 'cost_per_month', spent: 1340, audit: false, when: 'all users' },
    { id: 'br-3', name: 'Embeddings daily ceiling', per: 'model', limit: 400, unit: 'cost_per_day', spent: 288, audit: false, when: 'model = */embedding*' },
    { id: 'br-4', name: 'Experimental — audit only', per: 'metadata.project', limit: 1000, unit: 'cost_per_week', spent: 1420, audit: true, when: 'metadata.env = staging' },
  ],
  rateRules: [
    { id: 'rl-1', name: 'Global per-VA limit', per: 'virtualaccount', rpm: 6000, tpm: 2000000, when: 'all virtual accounts' },
    { id: 'rl-2', name: 'Free tier throttle', per: 'user', rpm: 60, tpm: 90000, when: 'team = trial' },
    { id: 'rl-3', name: 'Fast-tier burst', per: 'user', rpm: 1200, tpm: 600000, when: 'model = vm/fast-tier' },
  ],

  users: [
    { id: 'u1', name: 'Avery Sembiring', email: 'avery.sembiring@pangreksa.io', roles: ['Super Admin'], provider: 'Local', status: 'active', mfa: true, last: 'Active now' },
    { id: 'u2', name: 'Maya Tarigan', email: 'maya.t@pangreksa.io', roles: ['Prompt Manager', 'Developer'], provider: 'Entra ID', status: 'active', mfa: true, last: '12 min ago' },
    { id: 'u3', name: 'Deni Ginting', email: 'deni.g@pangreksa.io', roles: ['Gateway Admin'], provider: 'Entra ID', status: 'active', mfa: true, last: '1 hr ago' },
    { id: 'u4', name: 'Rosa Sinaga', email: 'rosa.s@pangreksa.io', roles: ['Developer'], provider: 'Active Directory', status: 'active', mfa: false, last: '3 hr ago' },
    { id: 'u5', name: 'platform-svc', email: 'svc-platform@pangreksa.io', roles: ['Gateway Admin'], provider: 'Virtual Account', status: 'active', mfa: false, last: 'Active now' },
    { id: 'u6', name: 'Tomi Hutapea', email: 'tomi.h@pangreksa.io', roles: ['Billing Manager'], provider: 'Active Directory', status: 'invited', mfa: false, last: 'Never' },
    { id: 'u7', name: 'Lia Panjaitan', email: 'lia.p@pangreksa.io', roles: ['Read-Only'], provider: 'Entra ID', status: 'suspended', mfa: true, last: '8 days ago' },
  ],
  roles: [
    { id: 'r1', name: 'Super Admin', users: 1, perms: 142, builtin: true, desc: 'Full unrestricted access to every resource and action' },
    { id: 'r2', name: 'Gateway Admin', users: 2, perms: 68, builtin: true, desc: 'Manage gateway: virtual models, providers, routing, caching' },
    { id: 'r3', name: 'Prompt Manager', users: 1, perms: 24, builtin: true, desc: 'Create and manage prompt registry and versions' },
    { id: 'r4', name: 'Developer', users: 3, perms: 31, builtin: true, desc: 'Read configuration and call models; manage own tokens' },
    { id: 'r5', name: 'Billing Manager', users: 1, perms: 18, builtin: true, desc: 'View costs and manage budgets and rate limits' },
    { id: 'r6', name: 'Read-Only', users: 1, perms: 22, builtin: true, desc: 'Read-only access across all resources' },
    { id: 'r7', name: 'On-Call SRE', users: 0, perms: 29, builtin: false, desc: 'Custom: observability, traces, and incident response' },
  ],
  permissionGroups: [
    { group: 'Gateway', tokens: [
      { token: 'gateway.virtual_model.read', label: 'View virtual models' },
      { token: 'gateway.virtual_model.create', label: 'Create virtual models' },
      { token: 'gateway.virtual_model.update', label: 'Update virtual models' },
      { token: 'gateway.virtual_model.delete', label: 'Delete virtual models' },
      { token: 'gateway.provider_account.manage', label: 'Manage provider accounts' },
      { token: 'gateway.cache.configure', label: 'Configure caching' },
    ] },
    { group: 'Prompts', tokens: [
      { token: 'prompt.registry.read', label: 'View prompt registry' },
      { token: 'prompt.version.create', label: 'Create prompt versions' },
      { token: 'prompt.version.rollback', label: 'Rollback prompt versions' },
    ] },
    { group: 'Admin', tokens: [
      { token: 'admin.budget_rules.read', label: 'View budget rules' },
      { token: 'admin.budget_rules.write', label: 'Create/edit budget rules' },
      { token: 'admin.budget_rules.delete', label: 'Delete budget rules' },
      { token: 'admin.users.manage', label: 'Manage users' },
      { token: 'admin.roles.manage', label: 'Manage roles' },
      { token: 'admin.auth.configure', label: 'Configure auth providers' },
    ] },
    { group: 'Observability', tokens: [
      { token: 'metrics.dashboard.read', label: 'View metrics dashboards' },
      { token: 'metrics.traces.read', label: 'View request traces' },
      { token: 'metrics.traces.export', label: 'Export traces (CSV)' },
    ] },
  ],

  authProviders: [
    { id: 'local', name: 'Local User Table', icon: 'database', enabled: true, users: 3, desc: 'Username/password with Argon2id, TOTP MFA, account lockout', badge: 'Argon2id' },
    { id: 'entra', name: 'Microsoft Entra ID', icon: 'cloud', enabled: true, users: 3, desc: 'OIDC Authorization Code + PKCE, JIT provisioning, group mapping', badge: 'OIDC' },
    { id: 'ad', name: 'Active Directory / LDAP', icon: 'server', enabled: true, users: 2, desc: 'LDAPS bind on port 636, Kerberos SSO, memberOf group mapping', badge: 'LDAPS' },
  ],
  tokens: [
    { id: 't1', name: 'web-app-prod', type: 'VAT', prefix: 'pk-vat-9f3a…c1', owner: 'platform-svc', created: '2026-03-12', lastUsed: 'Active now', expires: 'Auto-rotate 30d', scopes: 'vm/general-chat, vm/fast-tier', status: 'active' },
    { id: 't2', name: 'data-pipeline', type: 'VAT', prefix: 'pk-vat-22b8…7e', owner: 'platform-svc', created: '2026-02-01', lastUsed: '4 min ago', expires: 'Auto-rotate 90d', scopes: 'vm/embeddings', status: 'active' },
    { id: 't3', name: 'avery-laptop', type: 'PAT', prefix: 'pk-pat-71de…aa', owner: 'Avery Sembiring', created: '2026-05-20', lastUsed: '2 hr ago', expires: '2026-08-20', scopes: 'all', status: 'active' },
    { id: 't4', name: 'maya-dev', type: 'PAT', prefix: 'pk-pat-04c9…2f', owner: 'Maya Tarigan', created: '2026-05-18', lastUsed: '1 day ago', expires: '2026-07-18', scopes: 'prompt.*, vm/general-chat', status: 'active' },
    { id: 't5', name: 'legacy-batch', type: 'VAT', prefix: 'pk-vat-8a10…b4', owner: 'data-pipeline', created: '2025-11-02', lastUsed: '14 days ago', expires: 'Expired', scopes: 'vm/embeddings', status: 'expired' },
  ],
};

export type SeedData = typeof SEED;
