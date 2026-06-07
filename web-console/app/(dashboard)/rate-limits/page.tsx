'use client';

/** Policies → Rate Limits. Full CRUD over the `rate-limits` resource. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId } from '@/lib/hooks';
import type { RateLimit } from '@/lib/types';

export default function RateLimitsPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<RateLimit & Record<string, unknown>>[] = [
    { key: 'name', label: 'Name', render: (r) => <span className="cell-strong">{r.name}</span> },
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
      sub="RPM / TPM / RPD / TPD ceilings. Lower priority numbers are evaluated first."
      addLabel="Add rate limit"
      getKey={(r) => r.id}
      searchKeys={['name', 'limit_type']}
      createDefaults={orgId ? { org_id: orgId } : {}}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Free tier throttle' },
        { key: 'limit_type', label: 'Limit type', type: 'select', options: ['rpm', 'tpm', 'rpd', 'tpd'], default: 'rpm' },
        { key: 'limit_value', label: 'Limit value', type: 'number', placeholder: '6000' },
        { key: 'window_seconds', label: 'Window (seconds)', type: 'number', default: '60' },
        { key: 'priority', label: 'Priority', type: 'number', default: '0' },
        { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
      ]}
    />
  );
}
