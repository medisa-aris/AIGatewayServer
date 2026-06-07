'use client';

/** Policies → Guardrails. CRUD over `guardrail-profiles` + a static hook-flow diagram. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useDefaultOrgId } from '@/lib/hooks';
import type { GuardrailProfile } from '@/lib/types';

const HOOKS = [
  { id: 'llm_input', label: 'LLM Input', icon: 'arrowRight' },
  { id: 'llm_output', label: 'LLM Output', icon: 'arrowRight' },
  { id: 'mcp_pre', label: 'MCP Pre-invoke', icon: 'server' },
  { id: 'mcp_post', label: 'MCP Post-invoke', icon: 'server' },
];

export default function GuardrailsPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<GuardrailProfile & Record<string, unknown>>[] = [
    { key: 'name', label: 'Profile', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'description', label: 'Description', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.description ?? '—'}</span> },
    { key: 'is_default', label: 'Default', render: (r) => (r.is_default ? <Tag color="purple" sm>default</Tag> : <span className="muted">—</span>) },
    { key: 'is_active', label: 'Active', render: (r) => (r.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>off</Tag>) },
  ];
  return (
    <div>
      <Section title="Enforcement hooks" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {HOOKS.map((h) => (
            <div key={h.id} className="tile" style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '3px solid var(--brand)' }}>
              <span style={{ color: 'var(--brand)' }}><Icon name={h.icon} size={18} /></span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-helper)' }}>guardrail hook</div>
              </div>
            </div>
          ))}
        </div>
      </Section>
      <ResourceCrud<GuardrailProfile>
        resource="guardrail-profiles"
        title="Guardrail Profiles"
        sub="Content-safety policies (PII, injection, moderation, secrets) attached to one or more hooks."
        addLabel="Add guardrail"
        getKey={(r) => r.id}
        searchKeys={['name']}
        createDefaults={orgId ? { org_id: orgId } : {}}
        columns={columns}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'PII Redaction' },
          { key: 'description', label: 'Description', type: 'textarea', nullable: true },
          { key: 'is_default', label: 'Default profile', type: 'toggle', default: 'false' },
          { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
        ]}
      />
    </div>
  );
}
