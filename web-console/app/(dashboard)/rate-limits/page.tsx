'use client';

/** Policies → Rate Limits. Full CRUD over the `rate-limits` resource. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId } from '@/lib/hooks';
import type { RateLimit } from '@/lib/types';

const scopeColor: Record<string, 'purple' | 'blue' | 'cyan' | 'teal'> = { global: 'purple', org: 'blue', role: 'cyan', user: 'teal' };

export default function RateLimitsPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<RateLimit & Record<string, unknown>>[] = [
    { key: 'name', label: 'Name', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'scope', label: 'Scope', render: (r) => <Tag color={scopeColor[r.scope] ?? 'gray'} sm>{r.scope}</Tag> },
    { key: 'limit_type', label: 'Type', render: (r) => <span className="mono">{r.limit_type.toUpperCase()}</span> },
    { key: 'limit_value', label: 'Limit', align: 'right', render: (r) => <span className="mono">{Number(r.limit_value).toLocaleString()}</span> },
    { key: 'window_seconds', label: 'Window', align: 'right', render: (r) => <span className="mono">{r.window_seconds}s</span> },
    { key: 'priority', label: 'Priority', align: 'right', render: (r) => <span className="mono">{r.priority}</span> },
    { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>off</Tag>) },
  ];
  return (
    <ResourceCrud<RateLimit>
      resource="rate-limits"
      title="Rate Limits"
      sub="RPM / TPM / RPD / TPD ceilings per scope. Lower priority numbers are evaluated first."
      addLabel="Add rate limit"
      getKey={(r) => r.id}
      searchKeys={['name', 'scope', 'limit_type']}
      createDefaults={orgId ? { org_id: orgId } : {}}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Free tier throttle' },
        { key: 'scope', label: 'Scope', type: 'select', options: ['global', 'org', 'role', 'user'], default: 'user' },
        { key: 'scope_id', label: 'Scope target id', help: 'Required unless scope is global', nullable: true, showIf: (f) => f.scope !== 'global' },
        { key: 'limit_type', label: 'Limit type', type: 'select', options: ['rpm', 'tpm', 'rpd', 'tpd'], default: 'rpm' },
        { key: 'limit_value', label: 'Limit value', type: 'number', placeholder: '6000' },
        { key: 'window_seconds', label: 'Window (seconds)', type: 'number', default: '60' },
        { key: 'priority', label: 'Priority', type: 'number', default: '0' },
        { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
      ]}
    />
  );
}
