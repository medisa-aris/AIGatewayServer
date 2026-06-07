'use client';

/** Policies → Budgets. Full CRUD over the `budgets` resource with usage bars. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId, useResourceList } from '@/lib/hooks';
import { usd } from '@/components/charts';
import type { Budget, UserBudget } from '@/lib/types';

export default function BudgetsPage() {
  const orgId = useDefaultOrgId();

  // Fetch all user_budgets to compute actual consumption per budget
  const { data: userBudgets } = useResourceList<UserBudget>('user-budgets', { limit: 500 });

  // Sum consumed_amount per budget_id
  const consumedByBudget = userBudgets.reduce<Map<string, number>>((acc, ub) => {
    if (!ub.budget_id) return acc;
    acc.set(ub.budget_id, (acc.get(ub.budget_id) ?? 0) + Number(ub.consumed_amount));
    return acc;
  }, new Map());

  const columns: Column<Budget & Record<string, unknown>>[] = [
    { key: 'name', label: 'Budget', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'period', label: 'Period', render: (r) => <Tag color="blue" sm>{r.period ?? '—'}</Tag> },
    { key: 'total_amount', label: 'Total', align: 'right', render: (r) => <span className="mono">{usd(Number(r.total_amount))}</span> },
    {
      key: 'usage',
      label: 'Consumed',
      render: (r) => {
        const total = Number(r.total_amount) || 0;
        const consumed = consumedByBudget.get(r.id) ?? 0;
        const pct = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
            <div className="bar-track" style={{ flex: 1 }}>
              <div className="bar-fill" style={{ width: pct + '%', background: pct > 90 ? 'var(--support-error)' : 'var(--brand)' }} />
            </div>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)' }}>{usd(consumed)} ({pct}%)</span>
          </div>
        );
      },
    },
    { key: 'is_shared', label: 'Shared', render: (r) => (r.is_shared ? <Tag color="teal" sm>shared</Tag> : <Tag color="gray" sm>per-user</Tag>) },
  ];
  return (
    <ResourceCrud<Budget>
      resource="budgets"
      title="Budgets"
      sub="Spend ceilings per organization, role or user, with rolling periods and shared pools."
      addLabel="Add budget"
      getKey={(r) => r.id}
      searchKeys={['name', 'period']}
      createDefaults={orgId ? { org_id: orgId, remaining_amount: 0 } : { remaining_amount: 0 }}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Per-user monthly cap' },
        { key: 'total_amount', label: 'Total amount', type: 'number', placeholder: '2000' },
        { key: 'currency', label: 'Currency', type: 'select', options: ['USD', 'EUR', 'GBP', 'IDR'], default: 'USD' },
        { key: 'period', label: 'Period', type: 'select', options: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'], default: 'monthly' },
        { key: 'period_start', label: 'Period start (ISO)', nullable: true, placeholder: '2026-06-01' },
        { key: 'period_end', label: 'Period end (ISO)', nullable: true, placeholder: '2026-07-01' },
        { key: 'is_shared', label: 'Shared pool', type: 'toggle', default: 'false' },
      ]}
    />
  );
}
