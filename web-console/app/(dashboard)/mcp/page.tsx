'use client';

/** Registry → MCP Servers. CRUD over `mcp-servers` with tool row expansion. */

import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, type Column } from '@/components/ui';
import { useDefaultOrgId } from '@/lib/hooks';
import type { McpServer } from '@/lib/types';

const statusColor: Record<string, 'green' | 'warm' | 'gray'> = { connected: 'green', degraded: 'warm', idle: 'gray' };

export default function McpPage() {
  const orgId = useDefaultOrgId();
  const columns: Column<McpServer & Record<string, unknown>>[] = [
    { key: 'name', label: 'Server', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'slug', label: 'Slug', render: (r) => <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)' }}>{r.slug}</span> },
    { key: 'transport', label: 'Transport', render: (r) => <Tag color="blue" sm>{r.transport ?? '—'}</Tag> },
    { key: 'endpoint_url', label: 'Endpoint', render: (r) => <span className="mono" style={{ fontSize: 12 }}>{r.endpoint_url ?? '—'}</span> },
    { key: 'status', label: 'Status', render: (r) => <Tag color={statusColor[r.status ?? 'idle'] ?? 'gray'} sm dot>{r.status ?? 'idle'}</Tag> },
  ];
  return (
    <ResourceCrud<McpServer>
      resource="mcp-servers"
      title="MCP Servers"
      sub="Registered Model Context Protocol servers exposing tools and resources to agents."
      addLabel="Register server"
      getKey={(r) => r.id}
      searchKeys={['name', 'slug']}
      createDefaults={orgId ? { org_id: orgId } : {}}
      columns={columns}
      fields={[
        { key: 'name', label: 'Name', placeholder: 'GitHub' },
        { key: 'slug', label: 'Slug', mono: true, placeholder: 'github' },
        { key: 'transport', label: 'Transport', type: 'select', options: ['http', 'sse', 'stdio', 'websocket'], default: 'http' },
        { key: 'endpoint_url', label: 'Endpoint URL', mono: true, nullable: true, placeholder: 'https://mcp.example.com' },
        { key: 'status', label: 'Status', type: 'select', options: ['connected', 'degraded', 'idle'], default: 'connected' },
        { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
      ]}
    />
  );
}
