'use client';

import { useRouter } from 'next/navigation';
import { PageHead, Btn, Tag, DataTable, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { useResourceList } from '@/lib/hooks';
import { updateResource, ApiError } from '@/lib/api/resources';
import type { VirtualModel, VirtualModelRoutingConfig } from '@/lib/types';

const ENGINE_LABELS: Record<string, { label: string; color: 'blue' | 'purple' | 'cyan' | 'gray' }> = {
  classifier:        { label: 'Classifier',         color: 'blue'   },
  'rule-based':      { label: 'Rule-based',         color: 'cyan'   },
  'rules-classifier':{ label: 'Rules + classifier', color: 'purple' },
};

export default function VirtualModelsPage() {
  const router = useRouter();
  const { data, mutate } = useResourceList<VirtualModel>('virtual-models', { limit: 500 });
  const active = data.filter(v => v.is_active !== false);

  async function softDelete(row: VirtualModel) {
    try {
      await updateResource('virtual-models', row.id, { is_active: false });
      mutate();
    } catch (e) {
      if (e instanceof ApiError) alert(e.message);
    }
  }

  const columns: Column<VirtualModel & Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Virtual model',
      render: (r) => (
        <span
          className="cell-strong"
          style={{ cursor: 'pointer', color: 'var(--link)' }}
          onClick={() => router.push(`/virtual-models/${r.id}`)}
        >
          {r.name}
        </span>
      ),
    },
    {
      key: 'slug',
      label: 'Slug',
      render: (r) => (
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)' }}>
          {r.slug}
        </span>
      ),
    },
    {
      key: 'routing_config',
      label: 'Decision engine',
      render: (r) => {
        const cfg = r.routing_config as VirtualModelRoutingConfig | null;
        if (!cfg?.auto_route) return <span style={{ color: 'var(--text-helper)', fontSize: 12 }}>Manual</span>;
        const e = ENGINE_LABELS[cfg.decision_engine];
        return e ? <Tag color={e.color} sm>{e.label}</Tag> : <span style={{ fontSize: 12 }}>—</span>;
      },
    },
    {
      key: 'is_active',
      label: 'Status',
      render: (r) => (r.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="gray" sm>paused</Tag>),
    },
  ];

  return (
    <div>
      <PageHead
        title="Virtual Models"
        sub="Routing aliases that fan out to one or more provider models by weight, latency, priority or routing strategy."
        actions={
          <Btn kind="primary" size="sm" icon="add" onClick={() => router.push('/virtual-models/new')}>
            Add virtual model
          </Btn>
        }
      />

      <Section style={{ paddingTop: 20 }}>
        <DataTable<VirtualModel & Record<string, unknown>>
          columns={columns}
          rows={active as (VirtualModel & Record<string, unknown>)[]}
          getKey={(r) => r.id}
          searchKeys={['name', 'slug'] as (keyof (VirtualModel & Record<string, unknown>))[]}
          rowActions={(row) => (
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn kind="ghost" size="sm" icon="edit" title="Edit"
                onClick={() => router.push(`/virtual-models/${row.id}`)} />
              <Btn kind="danger-ghost" size="sm" icon="trash" title="Delete"
                onClick={() => softDelete(row as VirtualModel)} />
            </div>
          )}
        />
      </Section>
    </div>
  );
}
