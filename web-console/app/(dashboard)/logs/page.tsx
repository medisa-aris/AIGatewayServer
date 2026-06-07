'use client';

/**
 * Monitor → Request Logs / Traces. Ported from screens-logs.jsx.
 * Wired to the live `request-logs` resource through the BFF (seed traces as
 * fallback). Rows map DB columns → the trace view-model the table expects.
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead, Btn, Tag, Select, KV, SearchBox, DataTable, Pagination, type Column } from '@/components/ui';
import { Section, ChartCard, StatStrip } from '@/components/ui/screen';
import { ProviderMark } from '@/components/Icon';
import { HeatStrip, fmtNum } from '@/components/charts';
import { useResourceList } from '@/lib/hooks';
import { SEED } from '@/lib/seed';
import type { RequestLog } from '@/lib/types';

/** Infer a provider label from a model_id prefix (no providers table exists). */
function providerOf(modelId: string): string {
  const m = modelId.toLowerCase();
  if (m.startsWith('gpt') || m.startsWith('text-embedding') || m.startsWith('o1') || m.startsWith('o3')) return 'OpenAI';
  if (m.startsWith('claude')) return 'Anthropic';
  if (m.startsWith('gemini')) return 'Google Vertex';
  if (m.startsWith('mistral')) return 'Mistral';
  if (m.startsWith('llama')) return 'Groq';
  if (m.startsWith('nova') || m.startsWith('titan')) return 'AWS Bedrock';
  return 'OpenAI';
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

interface TraceRow {
  id: string;
  reqId: string;
  time: string;
  ts: string;
  model: string;
  provider: string;
  user: string;
  endpoint: string;
  status: number;
  latency: number;
  ttft: number | null;
  inTok: number;
  outTok: number;
  cost: number;
  cached: boolean;
  guardrail: string | null;
  vm: string;
}

function toTrace(l: RequestLog): TraceRow {
  const model = l.model_id ?? 'unknown';
  return {
    id: l.request_id ?? l.id,
    reqId: l.request_id ?? l.id,
    time: relTime(l.started_at),
    ts: l.started_at,
    model,
    provider: providerOf(model),
    user: l.user_id ? l.user_id.slice(0, 8) : 'anonymous',
    endpoint: l.path ?? '/v1/chat/completions',
    status: l.status_code ?? 200,
    latency: Number(l.latency_ms ?? 0),
    ttft: null,
    inTok: Number(l.input_tokens ?? 0),
    outTok: Number(l.output_tokens ?? 0),
    cost: Number(l.cost ?? 0),
    cached: (l.cached_tokens ?? 0) > 0,
    guardrail: l.guardrail_profile_id ? 'PII Redaction' : null,
    vm: l.virtual_model_id ?? 'vm/general-chat',
  };
}

function statusTag(s: number) {
  if (s < 300) return <Tag color="green" sm>{s}</Tag>;
  if (s === 429) return <Tag color="warm" sm>{s}</Tag>;
  return <Tag color="red" sm>{s}</Tag>;
}

export default function LogsPage() {
  const router = useRouter();
  const { data: logs } = useResourceList<RequestLog>('request-logs', { limit: 500 });
  const traces = useMemo(() => logs.map(toTrace), [logs]);

  const [q, setQ] = useState('');
  const [fModel, setFModel] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [live, setLive] = useState(true);

  const models = ['all', ...Array.from(new Set(traces.map((t) => t.model)))];
  const rows = traces.filter(
    (t) =>
      (fModel === 'all' || t.model === fModel) &&
      (fStatus === 'all' || (fStatus === 'ok' ? t.status < 300 : fStatus === 'err' ? t.status >= 400 : true)) &&
      (q === '' || t.id.includes(q) || t.user.includes(q) || t.model.includes(q)),
  );
  const total = rows.length;
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  const cols: Column<TraceRow & Record<string, unknown>>[] = [
    { key: 'time', label: 'Time', width: 90, render: (t) => <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>{t.time}</span> },
    { key: 'id', label: 'Request ID', render: (t) => <span className="mono" style={{ fontSize: 12, color: 'var(--link-primary)' }}>{t.id}</span> },
    {
      key: 'model',
      label: 'Model',
      render: (t) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ProviderMark name={t.provider} size={18} />
          <span className="mono" style={{ fontSize: 12 }}>{t.model}</span>
        </span>
      ),
    },
    { key: 'user', label: 'Caller', render: (t) => <span className="mono" style={{ fontSize: 12 }}>{t.user}</span> },
    { key: 'status', label: 'Status', render: (t) => statusTag(t.status) },
    { key: 'latency', label: 'Latency', align: 'right', render: (t) => <span className="mono" style={{ fontSize: 12, color: t.latency > 1500 ? 'var(--support-warning)' : 'var(--text-secondary)' }}>{t.latency}ms</span> },
    { key: 'tok', label: 'Tokens', align: 'right', render: (t) => <span className="mono" style={{ fontSize: 12 }}>{fmtNum(t.inTok)}→{fmtNum(t.outTok)}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (t) => <span className="mono" style={{ fontSize: 12 }}>${t.cost.toFixed(4)}</span> },
    { key: 'flags', label: '', width: 80, render: (t) => <span style={{ display: 'flex', gap: 4 }}>{t.cached && <Tag color="teal" sm>cache</Tag>}{t.guardrail && <Tag color="purple" sm>PII</Tag>}</span> },
  ];

  const expand = (t: TraceRow) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
      <div style={{ gridColumn: 'span 4', display: 'flex', gap: 8, marginBottom: 4 }}>
        <Tag color="blue" sm>{t.endpoint}</Tag>
        <Tag color="gray" sm>{t.vm}</Tag>
        <Tag color="cyan" sm>{t.provider}</Tag>
        {t.cached && <Tag color="teal" sm>cache hit</Tag>}
        {t.guardrail && <Tag color="purple" sm>{t.guardrail}</Tag>}
      </div>
      <KV k="Request ID" v={<span className="mono">{t.reqId}</span>} />
      <KV k="Timestamp" v={<span className="mono">{t.ts}</span>} />
      <KV k="Routed model" v={<span className="mono">{t.model}</span>} />
      <KV k="HTTP status" v={statusTag(t.status)} />
      <KV k="Total latency" v={<span className="mono">{t.latency} ms</span>} />
      <KV k="Time to first token" v={<span className="mono">{t.ttft ? t.ttft + ' ms' : '–'}</span>} />
      <KV k="Input tokens" v={<span className="mono">{fmtNum(t.inTok)}</span>} />
      <KV k="Output tokens" v={<span className="mono">{fmtNum(t.outTok)}</span>} />
      <div style={{ gridColumn: 'span 4', marginTop: 8, display: 'flex', gap: 8 }}>
        <Btn kind="tertiary" size="sm" icon="code">View span JSON</Btn>
        <Btn kind="ghost" size="sm" icon="flag">Attach feedback</Btn>
        <Btn kind="ghost" size="sm" icon="model" onClick={() => router.push('/model-metrics')}>Model metrics</Btn>
      </div>
    </div>
  );

  return (
    <div>
      <PageHead
        title="Request Logs"
        sub="Full request + response traces with OpenTelemetry span attributes. Filter, expand any row, and export."
        actions={
          <>
            <button className={'btn sm ' + (live ? 'tertiary' : 'ghost')} onClick={() => setLive((l) => !l)}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className={'sdot ' + (live ? 'pulse-dot' : '')} style={{ width: 8, height: 8, borderRadius: '50%', background: live ? 'var(--support-success)' : 'var(--text-placeholder)', color: 'var(--support-success)' }} />
                {live ? 'Live tail on' : 'Live tail off'}
              </span>
            </button>
            <Btn kind="tertiary" size="sm" icon="download2">Export</Btn>
          </>
        }
      />
      <Section style={{ paddingTop: 24 }}>
        <StatStrip
          stats={[
            { label: 'Requests (loaded)', icon: 'activity', value: fmtNum(total) },
            { label: 'Success rate', icon: 'checkmarkFill', value: total ? Math.round((rows.filter((t) => t.status < 400).length / total) * 1000) / 10 + '%' : '—' },
            { label: 'Avg latency', icon: 'time', value: total ? Math.round(rows.reduce((a, t) => a + t.latency, 0) / total) + 'ms' : '—' },
            { label: 'Cache hits', icon: 'zap', value: total ? Math.round((rows.filter((t) => t.cached).length / total) * 1000) / 10 + '%' : '—' },
          ]}
        />
      </Section>
      <Section style={{ paddingTop: 20 }}>
        <ChartCard title="Request volume" sub="Last 24 hours">
          <HeatStrip data={SEED.overview.hourly} cols={24} height={22} color="#1192e8" live={live} />
        </ChartCard>
      </Section>
      <Section style={{ paddingTop: 20 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 260 }}>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search by ID, caller, model" />
          </div>
          <div style={{ width: 200 }}>
            <Select value={fModel} onChange={(v) => { setFModel(v); setPage(1); }} options={models.map((m) => ({ value: m, label: m === 'all' ? 'All models' : m }))} />
          </div>
          <div style={{ width: 150 }}>
            <Select value={fStatus} onChange={(v) => { setFStatus(v); setPage(1); }} options={[{ value: 'all', label: 'All statuses' }, { value: 'ok', label: '2xx success' }, { value: 'err', label: '4xx / 5xx errors' }]} />
          </div>
          <Tag color="gray">{total} results</Tag>
        </div>
        <div className="dt-wrap">
          <DataTable columns={cols} rows={pageRows as (TraceRow & Record<string, unknown>)[]} getKey={(t) => t.id} renderExpand={expand} compact />
          <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />
        </div>
      </Section>
    </div>
  );
}
