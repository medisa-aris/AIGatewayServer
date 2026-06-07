'use client';

/** Policies → PII Protection. Full CRUD over the `pii-objects` resource. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId } from '@/lib/hooks';
import type { PiiObject } from '@/lib/types';

export default function PiiPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<PiiObject & Record<string, unknown>>[] = [
    { key: 'name', label: 'PII object', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'detection_method', label: 'Detection', render: (r) => <Tag color="blue" sm>{r.detection_method}</Tag> },
    { key: 'masking_style', label: 'Masking', render: (r) => <Tag color="purple" sm>{r.masking_style}</Tag> },
    { key: 'pattern', label: 'Regex', render: (r) => r.pattern ? <code className="mono" style={{ fontSize: '0.75rem', opacity: 0.85 }}>{r.pattern}</code> : <span style={{ opacity: 0.35 }}>—</span> },
    { key: 'min_confidence', label: 'Min confidence', align: 'right', render: (r) => <span className="mono">{Math.round(Number(r.min_confidence) * 100)}%</span> },
    { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>off</Tag>) },
  ];
  return (
    <ResourceCrud<PiiObject>
      resource="pii-objects"
      title="PII Protection"
      sub="Detection and masking rules for personally identifiable information across requests, responses and tool I/O."
      addLabel="Add PII object"
      getKey={(r) => r.id}
      searchKeys={['name', 'detection_method', 'masking_style']}
      createDefaults={orgId ? { org_id: orgId } : {}}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'Email Address' },
        { key: 'description', label: 'Description', nullable: true },
        { key: 'detection_method', label: 'Detection method', type: 'select', options: ['regex', 'ner', 'llm', 'dict'], default: 'regex' },
        { key: 'pattern', label: 'Regex pattern', mono: true, nullable: true, help: 'Required for regex detection', showIf: (f) => f.detection_method === 'regex' },
        { key: 'masking_style', label: 'Masking style', type: 'select', options: ['redact', 'replace', 'hash', 'partial'], default: 'redact' },
        { key: 'replacement_text', label: 'Replacement text', nullable: true, showIf: (f) => f.masking_style === 'replace', default: '[REDACTED]' },
        { key: 'min_confidence', label: 'Min confidence (0–1)', type: 'number', default: '0.80' },
        { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
      ]}
    />
  );
}
