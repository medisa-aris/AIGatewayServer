'use client';

/**
 * Monitor → Route Logs.
 *
 * Displays live RouteRequest execution records from the `route_logs` table.
 * Each row has an expand toggle that reveals the full pipeline trace
 * (guardrail/skill/MCP/provider checks) and the three message stages
 * (inquiry → request → output).
 *
 * Polls every 5 seconds for near-real-time updates.
 */

import { useState, useEffect } from 'react';
import { PageHead, DataTable, Tag, Btn, type Column } from '@/components/ui';
import { Section, StatStrip } from '@/components/ui/screen';
import { useResourceList } from '@/lib/hooks';
import type { RouteLog, RouteTestCheck } from '@/lib/types';

/* ------------------------------------------------------------------ helpers */

function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch {
    return val;
  }
}

function fmtCost(val: number | string | null | undefined): string {
  if (val == null) return '—';
  const n = Number(val);
  if (isNaN(n)) return '—';
  if (n === 0) return '$0.00';
  if (n < 0.0001) return `$${n.toFixed(8)}`;
  return `$${n.toFixed(6)}`;
}

function shortID(id: string | null | undefined): string {
  if (!id) return '—';
  return id.slice(0, 8) + '…';
}

function StatusBadge({ status }: { status: RouteLog['status'] }) {
  const map: Record<RouteLog['status'], { label: string; color: string }> = {
    allowed: { label: 'Allowed', color: '#22c55e' },
    blocked: { label: 'Blocked', color: '#ef4444' },
    error:   { label: 'Error',   color: '#f59e0b' },
  };
  const { label, color } = map[status] ?? { label: status, color: '#6b7280' };
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: 11, fontWeight: 600, letterSpacing: '0.04em',
      background: color + '22', color,
    }}>
      {label}
    </span>
  );
}

function CheckStatusDot({ status }: { status: RouteTestCheck['status'] }) {
  const colors: Record<string, string> = {
    pass: '#22c55e', fail: '#ef4444', warn: '#f59e0b', skip: '#9ca3af',
  };
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: colors[status] ?? '#9ca3af', marginRight: 6, flexShrink: 0,
    }} />
  );
}

function PipelineTrace({ checks }: { checks: RouteTestCheck[] }) {
  if (!checks || checks.length === 0) {
    return <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No pipeline checks recorded.</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {checks.map((c, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '8px 10px', borderRadius: 6,
          background: 'rgba(0,0,0,.04)',
          fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
        }}>
          <CheckStatusDot status={c.status} />
          <div style={{ flex: 1 }}>
            <span style={{ fontWeight: 600 }}>{c.step}</span>
            <span style={{ marginLeft: 8, color: 'var(--text-secondary)' }}>{c.message}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageBlock({ label, content }: { label: string; content: string | null | undefined }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset', cursor: 'pointer', fontWeight: 600, fontSize: 12,
          color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span>
        {label}
      </button>
      {open && (
        <pre style={{
          marginTop: 6, padding: 12, borderRadius: 6, overflow: 'auto',
          background: 'rgba(0,0,0,.06)',
          fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          maxHeight: 240,
        }}>
          {content}
        </pre>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- detail panel */

function RouteLogDetail({ log }: { log: RouteLog }) {
  const checks: RouteTestCheck[] = Array.isArray(log.pipeline_checks) ? log.pipeline_checks : [];
  return (
    <div style={{ padding: '16px 24px', background: 'rgba(0,0,0,.02)' }}>
      {/* meta row */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 16, flexWrap: 'wrap', fontSize: 12 }}>
        <span><b>Request ID:</b> {log.request_id ?? '—'}</span>
        <span><b>Model:</b> {log.model_id ?? '—'}</span>
        <span><b>Endpoint:</b> {shortID(log.proxy_endpoint_id)}</span>
        {log.mcp_server_id && <span><b>MCP:</b> {shortID(log.mcp_server_id)}</span>}
        {log.completed_at && <span><b>Completed:</b> {fmtDate(log.completed_at)}</span>}
      </div>

      {/* pipeline trace */}
      <div style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Pipeline Checks</p>
        <PipelineTrace checks={checks} />
      </div>

      {/* messages */}
      <div>
        <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Messages</p>
        <MessageBlock label="Inquiry — original user message" content={log.message_inquiry} />
        <MessageBlock label="Request — augmented message sent to provider" content={log.message_request} />
        <MessageBlock label="Output — provider response" content={log.message_output} />
      </div>

      {log.error_message && (
        <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: '#ef444422', color: '#ef4444', fontSize: 12 }}>
          <b>Error:</b> {log.error_message}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function RouteLogsPage() {
  const { data: logs, isLoading, mutate } = useResourceList<RouteLog>(
    'route-logs',
    { limit: 200 },
    undefined,
    { refreshInterval: 5000 },
  );
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isLoading) setLastUpdated(new Date());
  }, [logs, isLoading]);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.round((Date.now() - lastUpdated.getTime()) / 1000)), 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  const columns: Column<RouteLog & Record<string, unknown>>[] = [
    {
      key: 'request_id',
      label: 'Request ID',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{shortID(row.request_id as string)}</span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge status={row.status as RouteLog['status']} />,
    },
    {
      key: 'model_id',
      label: 'Model',
      render: (row) => <span style={{ fontSize: 12 }}>{(row.model_id as string) || '—'}</span>,
    },
    {
      key: 'prompt_tokens',
      label: 'In Tokens',
      render: (row) => <span>{(row.prompt_tokens as number) ?? 0}</span>,
    },
    {
      key: 'completion_tokens',
      label: 'Out Tokens',
      render: (row) => <span>{(row.completion_tokens as number) ?? 0}</span>,
    },
    {
      key: 'cost',
      label: 'Cost',
      render: (row) => (
        <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{fmtCost(row.cost as number)}</span>
      ),
    },
    {
      key: 'latency_ms',
      label: 'Latency',
      render: (row) => <span>{(row.latency_ms as number) ?? 0} ms</span>,
    },
    {
      key: 'started_at',
      label: 'Started',
      render: (row) => <span style={{ fontSize: 12 }}>{fmtDate(row.started_at as string)}</span>,
    },
  ];

  const rows = [...logs].sort(
    (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime(),
  ) as (RouteLog & Record<string, unknown>)[];

  const allowed = logs.filter((l) => l.status === 'allowed').length;
  const blocked = logs.filter((l) => l.status === 'blocked').length;
  const errors = logs.filter((l) => l.status === 'error').length;

  return (
    <div>
      <PageHead
        title="Route Logs"
        sub="Audit trail for every live RouteRequest execution — pipeline checks, messages, tokens, and costs."
        actions={
          <>
            <Tag color="green" sm dot pulse>Live</Tag>
            <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>
              Updated {elapsed}s ago
            </span>
            <Btn kind="tertiary" size="sm" icon="reset" onClick={() => mutate()}>Refresh</Btn>
          </>
        }
      />

      <Section style={{ paddingTop: 20 }}>
        <StatStrip
          stats={[
            { label: 'Total Requests', icon: 'activity', value: String(logs.length) },
            { label: 'Allowed', icon: 'checkmark', value: String(allowed), delta: logs.length ? `${Math.round((allowed / logs.length) * 100)}%` : undefined, dir: 'up' },
            { label: 'Blocked', icon: 'error', value: String(blocked), delta: logs.length ? `${Math.round((blocked / logs.length) * 100)}%` : undefined, dir: blocked > 0 ? 'down' : undefined },
            { label: 'Errors', icon: 'warning', value: String(errors) },
          ]}
        />
      </Section>

      <Section>
        {isLoading ? (
          <div className="empty" style={{ padding: 48 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty" style={{ padding: 48, textAlign: 'center', color: 'var(--text-secondary)' }}>
            No route logs yet. Execute a request via{' '}
            <code style={{ fontFamily: 'monospace' }}>POST /api/v1/route-request</code> to see records here.
          </div>
        ) : (
          <DataTable
            columns={columns}
            rows={rows}
            getKey={(r) => r.id}
            sortable={false}
            renderExpand={(r) => <RouteLogDetail log={r as unknown as RouteLog} />}
          />
        )}
      </Section>
    </div>
  );
}
