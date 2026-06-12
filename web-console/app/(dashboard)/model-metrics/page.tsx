'use client';

/**
 * Monitor → Model Metrics.
 * Per-model request/token/cost/latency analytics.
 * Table + KPIs use live route_logs aggregation; trend charts use stable seed
 * generators (no per-model time-series in route_logs).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead, Btn, Tag, DataTable, OverflowMenu, Tabs, type Column } from '@/components/ui';
import { ChartCard, TimeRange, StatStrip, Section } from '@/components/ui/screen';
import { ProviderMark } from '@/components/Icon';
import { LineChart, fmtNum, usd } from '@/components/charts';
import { useAggregate } from '@/lib/hooks';
import { SEED, series } from '@/lib/seed';
import type { ModelMetricRow } from '@/lib/api/aggregations';

type SeedModel = (typeof SEED.models)[number];

interface LiveData {
  kpis: { total: number; totalCost: number; totalTokens: number; blocked: number; avgLatency: number };
  models: ModelMetricRow[];
}

const SEED_FALLBACK: LiveData = {
  kpis: {
    total: SEED.models.reduce((a, m) => a + m.reqs, 0),
    totalCost: SEED.models.reduce((a, m) => a + m.cost, 0),
    totalTokens: SEED.models.reduce((a, m) => a + m.inTok + m.outTok, 0),
    blocked: 0,
    avgLatency: Math.round(SEED.models.reduce((a, m) => a + m.p50, 0) / SEED.models.length),
  },
  models: SEED.models.map((m) => ({
    modelId: m.id,
    requests: m.reqs,
    inTokens: m.inTok,
    outTokens: m.outTok,
    cost: m.cost,
    p50: m.p50,
    p90: m.p90,
    p99: m.p99,
    failRate: m.fail,
  })),
};

export default function ModelMetricsPage() {
  const router = useRouter();
  const [range, setRange] = useState('7d');
  const [viewBy, setViewBy] = useState('models');
  const [sortKey, setSortKey] = useState<keyof ModelMetricRow>('requests');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selModelId, setSelModelId] = useState<string | null>(null);

  const { data: live, isLoading } = useAggregate<LiveData>('model-metrics', undefined, SEED_FALLBACK);
  const isLive = !isLoading && live !== SEED_FALLBACK;
  const models = live?.models ?? SEED_FALLBACK.models;
  const kpis = live?.kpis ?? SEED_FALLBACK.kpis;

  const sorted = [...models].sort((a, b) => {
    const av = a[sortKey] ?? 0, bv = b[sortKey] ?? 0;
    return (sortDir === 'asc' ? 1 : -1) * (av > bv ? 1 : -1);
  });

  const selId = selModelId ?? sorted[0]?.modelId ?? '';
  const selRow = models.find((m) => m.modelId === selId) ?? sorted[0];
  const seedModel = SEED.models.find((m) => m.id === selId) ?? SEED.models[0]!;

  const p50 = selRow?.p50 ?? seedModel.p50;
  const p90 = selRow?.p90 ?? seedModel.p90;
  const p99 = selRow?.p99 ?? seedModel.p99;
  const failRate = selRow?.failRate ?? seedModel.fail;
  const cost = selRow?.cost ?? seedModel.cost;
  const reqs = selRow?.requests ?? seedModel.reqs;

  const labels = SEED.days14;
  const rpsSeries = [{ name: selId, data: series((reqs % 1000) + 5, 14, reqs / 14 / 86400, 8, 0.2) }];
  const failSeries = [{ name: 'Failure %', data: series((reqs % 500) + 9, 14, failRate, 0.08).map((v) => Math.max(0, Math.round(v * 100) / 100)) }];
  const costSeries = [{ name: 'Cost', data: series((Math.round(cost) % 400) + 3, 14, cost / 14, cost / 200 + 0.01) }];
  const latency = [
    { name: 'P50', data: series(11, 14, p50 || 120, 20) },
    { name: 'P90', data: series(12, 14, p90 || 250, 40) },
    { name: 'P99', data: series(13, 14, p99 || 480, 90) },
  ];

  const cols: Column<ModelMetricRow>[] = [
    {
      key: 'modelId',
      label: 'Model',
      render: (m) => {
        const seed = SEED.models.find((s) => s.id === m.modelId);
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ProviderMark name={seed?.provider ?? ''} size={22} />
            <span className="cell-strong mono">{m.modelId}</span>
          </span>
        );
      },
    },
    { key: 'requests', label: 'Requests', align: 'right', render: (m) => <span className="mono">{fmtNum(m.requests)}</span> },
    { key: 'inTokens', label: 'Input tok', align: 'right', render: (m) => <span className="mono">{fmtNum(m.inTokens)}</span> },
    { key: 'outTokens', label: 'Output tok', align: 'right', render: (m) => <span className="mono">{fmtNum(m.outTokens)}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (m) => <span className="mono">{usd(m.cost)}</span> },
    { key: 'p90', label: 'P90', align: 'right', render: (m) => <span className="mono">{m.p90}ms</span> },
    { key: 'p99', label: 'P99', align: 'right', render: (m) => <span className="mono">{m.p99}ms</span> },
    { key: 'failRate', label: 'Fail %', align: 'right', render: (m) => <span className={'tag sm ' + (m.failRate > 0.4 ? 'red' : m.failRate > 0.25 ? 'warm' : 'green')}>{m.failRate}%</span> },
  ];

  return (
    <div>
      <PageHead
        title="Model Metrics"
        sub="Performance, token volume, cost and latency percentiles across every model and routing target."
        actions={
          <>
            {isLive
              ? <Tag color="blue" sm dot>Live</Tag>
              : <Tag color="warm" sm>Demo data</Tag>
            }
            <TimeRange value={range} onChange={setRange} ranges={['24h', '7d', '30d']} />
            <Btn kind="tertiary" size="sm" icon="download2">Export CSV</Btn>
          </>
        }
      />

      <Section style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>View by</span>
          <Tabs
            contained
            active={viewBy}
            onChange={setViewBy}
            tabs={[
              { id: 'models', label: 'Models' },
              { id: 'vmodels', label: 'Virtual Models' },
              { id: 'users', label: 'Users' },
              { id: 'vas', label: 'Virtual Accounts' },
              { id: 'teams', label: 'Teams' },
              { id: 'meta', label: 'Metadata' },
            ]}
          />
        </div>
        <StatStrip
          stats={[
            { label: 'Total Tokens', icon: 'arrowDown', value: fmtNum(kpis.totalTokens) },
            { label: 'Request Count', icon: 'activity', value: fmtNum(kpis.total) },
            { label: 'Total Cost', icon: 'money', value: usd(kpis.totalCost) },
            { label: 'Avg Latency', icon: 'time', value: kpis.avgLatency + 'ms' },
          ]}
        />
      </Section>

      <Section style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <ChartCard title="Requests per second" sub={selId}>
            <LineChart series={rpsSeries} labels={labels} height={200} area colors={['#1192e8']} yFormat={fmtNum} />
          </ChartCard>
          <ChartCard title="Request failure rate" sub="% of requests returning errors">
            <LineChart series={failSeries} labels={labels} height={200} area colors={['#fa4d56']} yFormat={(v) => v + '%'} />
          </ChartCard>
          <ChartCard title="Cost of inference" sub="Daily spend">
            <LineChart series={costSeries} labels={labels} height={200} area colors={['#009d9a']} yFormat={usd} />
          </ChartCard>
        </div>
      </Section>

      <Section style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <ChartCard title="Latency percentiles over time" sub={`${selId} · Request latency (ms)`} legend={[{ label: 'P50', color: '#1192e8' }, { label: 'P90', color: '#0f62fe' }, { label: 'P99', color: '#a56eff' }]}>
            <LineChart series={latency} labels={labels} height={230} colors={['#1192e8', '#0f62fe', '#a56eff']} yFormat={(v) => v + 'ms'} />
          </ChartCard>
          <ChartCard title="Latency distribution" sub="P50 · P75 · P90 · P99">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              {(
                [
                  ['Request latency', p50, Math.round(p50 * 1.3), p90, p99],
                  ['Time to first token', Math.round(p50 * 0.4), Math.round(p50 * 0.52), Math.round(p90 * 0.4), Math.round(p99 * 0.4)],
                  ['Inter-token latency', 24, 31, 42, 68],
                  ['Time per output token', 38, 46, 59, 92],
                ] as [string, number, number, number, number][]
              ).map((row, i) => (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{row[0]}</span>
                    <span className="mono" style={{ color: 'var(--text-helper)' }}>P99 {row[4]}ms</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 38 }}>
                    {([['50', row[1]], ['75', row[2]], ['90', row[3]], ['99', row[4]]] as [string, number][]).map((p, j) => (
                      <div key={j} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ height: Math.max(4, (p[1] / Math.max(row[4], 1)) * 32), background: ['#1192e8', '#0f62fe', '#6929c4', '#a56eff'][j], borderRadius: '2px 2px 0 0' }} />
                        <div style={{ fontSize: 9, color: 'var(--text-placeholder)', marginTop: 2 }}>P{p[0]}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>
        </div>
      </Section>

      <Section title="All models" count={sorted.length} style={{ paddingTop: 24 }} right={<span style={{ fontSize: 12, color: 'var(--text-helper)' }}>Click a row to drill into its charts above</span>}>
        <div className="dt-wrap">
          <DataTable
            columns={cols as Column<ModelMetricRow & Record<string, unknown>>[]}
            rows={sorted as (ModelMetricRow & Record<string, unknown>)[]}
            getKey={(m) => (m as ModelMetricRow).modelId}
            sortKey={sortKey as string}
            sortDir={sortDir}
            onSort={(kk) => {
              const key = kk as keyof ModelMetricRow;
              if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
              else { setSortKey(key); setSortDir('desc'); }
            }}
            rowActions={(m) => (
              <>
                <Btn kind="ghost" size="sm" icon="chartLine" title="View charts" onClick={() => setSelModelId((m as ModelMetricRow).modelId)} />
                <OverflowMenu
                  items={[
                    { icon: 'view', label: 'Open in traces', onClick: () => router.push('/route-logs') },
                    { icon: 'route', label: 'View routing', onClick: () => router.push('/virtual-models') },
                    { icon: 'money', label: 'Set custom cost' },
                  ]}
                />
              </>
            )}
          />
        </div>
      </Section>
    </div>
  );
}
