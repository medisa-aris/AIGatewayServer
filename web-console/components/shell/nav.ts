/**
 * Navigation model. Each item id is also its route path (`/<id>`), so the
 * design's hash-based SCREENS registry maps cleanly onto Next.js routes.
 */

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: string;
}
export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    group: 'Monitor',
    items: [
      { id: 'overview', label: 'Overview', icon: 'dashboard' },
      { id: 'model-metrics', label: 'Model Metrics', icon: 'model' },
      { id: 'guardrail-activity', label: 'Guardrails Activity', icon: 'shield' },
      { id: 'logs', label: 'Request Logs', icon: 'list', badge: 'live' },
      { id: 'dimensional', label: 'Dimensional Viewer', icon: 'layers' },
    ],
  },
  {
    group: 'Gateway',
    items: [
      { id: 'providers', label: 'Provider Accounts', icon: 'plug' },
      { id: 'virtual-models', label: 'Virtual Models', icon: 'route' },
      { id: 'proxy', label: 'Proxy', icon: 'globe' },
    ],
  },
  {
    group: 'Registry',
    items: [
      { id: 'prompts', label: 'Prompts', icon: 'document' },
      { id: 'mcp', label: 'MCP Servers', icon: 'server' },
      { id: 'skills', label: 'Skills', icon: 'idea' },
    ],
  },
  {
    group: 'Policies',
    items: [
      { id: 'guardrails', label: 'Guardrails', icon: 'shield' },
      { id: 'pii', label: 'PII Protection', icon: 'lock' },
      { id: 'budgets', label: 'Budgets', icon: 'money' },
      { id: 'rate-limits', label: 'Rate Limits', icon: 'gauge' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { id: 'users', label: 'Users & Roles', icon: 'users' },
      { id: 'org', label: 'Organization', icon: 'flow' },
      { id: 'auth', label: 'Authentication', icon: 'lock' },
      { id: 'tokens', label: 'API Tokens', icon: 'key' },
      { id: 'config', label: 'Configuration', icon: 'settings' },
    ],
  },
];

export const TITLES: Record<string, string> = Object.fromEntries(
  NAV.flatMap((g) => g.items.map((i) => [i.id, i.label])),
);
