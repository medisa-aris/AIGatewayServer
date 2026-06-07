'use client';

/** Registry → Prompts. CRUD over `prompt-registries`. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId } from '@/lib/hooks';
import type { PromptRegistry } from '@/lib/types';

export default function PromptsPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<PromptRegistry & Record<string, unknown>>[] = [
    { key: 'name', label: 'Registry', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'slug', label: 'Slug', render: (r) => <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)' }}>{r.slug}</span> },
    { key: 'category', label: 'Category', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.category ?? '—'}</span> },
    { key: 'visibility', label: 'Visibility', render: (r) => <Tag color="blue" sm>{r.visibility ?? 'private'}</Tag> },
    { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>off</Tag>) },
  ];
  return (
    <ResourceCrud<PromptRegistry>
      resource="prompt-registries"
      title="Prompt Registry"
      sub="Versioned prompt templates with diff, rollback and deployment aliases."
      addLabel="New registry"
      getKey={(r) => r.id}
      searchKeys={['name', 'slug', 'category']}
      createDefaults={orgId ? { org_id: orgId } : {}}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'triage-classifier' },
        { key: 'slug', label: 'Slug', mono: true, placeholder: 'triage-classifier' },
        { key: 'description', label: 'Description', type: 'textarea', nullable: true },
        { key: 'category', label: 'Category', nullable: true, placeholder: 'support' },
        { key: 'visibility', label: 'Visibility', type: 'select', options: ['private', 'org', 'public'], default: 'org' },
        { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
      ]}
    />
  );
}
