'use client';

/**
 * Monitor → Model Metrics. Ported from screens-metrics.jsx.
 * Per-model request/token/cost/latency analytics. The CRUD `models` resource
 * doesn't carry these rollups, so this view uses seed analytics (the live model
 * roster is available via /api/v1/models for the row count). Marked ⚠️.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead, Btn, Tag, DataTable, OverflowMenu, Tabs, type Column } from '@/components/ui';
import { ChartCard, TimeRange, StatStrip, Section } from '@/components/ui/screen';
import { ProviderMark } from '@/components/Icon';
import { LineChart, fmtNum, usd } from '@/components/charts';
import { SEED, series } from '@/lib/seed';

type SeedModel = (typeof SEED.models)[number];

export default function ModelMetricsPage() {
  const router = useRouter();
  const M = SEED.models;
  const [range, setRange] = useState('7d');
  const [viewBy, setViewBy] = useState('models');
  const [sel, setSel] = useState(M[0]!.id);
  const [sortKey, setSortKey] = useState<keyof SeedModel>('reqs');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = [...M].sort((a, b) => (sortDir === 'asc' ? 1 : -1) * (a[sortKey] > b[sortKey] ? 1 : -1));
  const model = M.find((m) => m.id === sel) || M[0]!;

  const totals = {
    inTok: M.reduce((a, m) => a + m.inTok, 0),
    outTok: M.reduce((a, m) => a + m.outTok, 0),
    reqs: M.reduce((a, m) => a + m.reqs, 0),
    cost: M.reduce((a, m) => a + m.cost, 0),
  };
  const labels = SEED.days14;
  const rpsSeries = [{ name: model.name, data: series((model.reqs % 1000) + 5, 14, model.reqs / 14 / 86400, 8, 0.2) }];
  const failSeries = [{ name: 'Failure %', data: series((model.reqs % 500) + 9, 14, model.fail, 0.08).map((v) => Math.max(0, Math.round(v * 100) / 100)) }];
  const costSeries = [{ name: 'Cost', data: series((model.cost % 400) + 3, 14, model.cost / 14, model.cost / 200) }];
  const latency = [
    { name: 'P50', data: series(11, 14, model.p50, 20) },
    { name: 'P90', data: series(12, 14, model.p90, 40) },
    { name: 'P99', data: series(13, 14, model.p99, 90) },
  ];

  const cols: Column<SeedModel>[] = [
    {
      key: 'name',
      label: 'Model',
      render: (m) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProviderMark name={m.provider} size={22} />
          <span>
            <span className="cell-strong mono">{m.name}</span>
            <br />
            <span style={{ fontSize: 11, color: 'var(--text-helper)' }}>{m.vm}</span>
          </span>
        </span>
      ),
    },
    { key: 'reqs', label: 'Requests', align: 'right', render: (m) => <span className="mono">{fmtNum(m.reqs)}</span> },
    { key: 'inTok', label: 'Input tok', align: 'right', render: (m) => <span className="mono">{fmtNum(m.inTok)}</span> },
    { key: 'outTok', label: 'Output tok', align: 'right', render: (m) => <span className="mono">{fmtNum(m.outTok)}</span> },
    { key: 'cost', label: 'Cost', align: 'right', render: (m) => <span className="mono">{usd(m.cost)}</span> },
    { key: 'p90', label: 'P90', align: 'right', render: (m) => <span className="mono">{m.p90}ms</span> },
    { key: 'p99', label: 'P99', align: 'right', render: (m) => <span className="mono">{m.p99}ms</span> },
    { key: 'fail', label: 'Fail %', align: 'right', render: (m) => <span className={'tag sm ' + (m.fail > 0.4 ? 'red' : m.fail > 0.25 ? 'warm' : 'green')}>{m.fail}%</span> },
  ];

  return (
    <div>
      <PageHead
        title="Model Metrics"
        sub="Performance, token volume, cost and latency percentiles across every model and routing target."
        actions={
          <>
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
            { label: 'Total Input Tokens', icon: 'arrowDown', value: fmtNum(totals.inTok), delta: '9.4%', dir: 'up' },
            { label: 'Total Output Tokens', icon: 'arrowUp', value: fmtNum(totals.outTok), delta: '11.2%', dir: 'up' },
            { label: 'Request Count', icon: 'activity', value: fmtNum(totals.reqs), delta: '8.1%', dir: 'up' },
            { label: 'Total Cost', icon: 'money', value: usd(totals.cost), delta: '12.4%', dir: 'up' },
          ]}
        />
      </Section>

      <Section style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <ChartCard title="Requests per second" sub={model.name} right={<Tag color="cyan" sm>{model.provider}</Tag>}>
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
          <ChartCard title="Latency percentiles over time" sub={`${model.name} · Request latency (ms)`} legend={[{ label: 'P50', color: '#1192e8' }, { label: 'P90', color: '#0f62fe' }, { label: 'P99', color: '#a56eff' }]}>
            <LineChart series={latency} labels={labels} height={230} colors={['#1192e8', '#0f62fe', '#a56eff']} yFormat={(v) => v + 'ms'} />
          </ChartCard>
          <ChartCard title="Latency distribution" sub="TTFT · ITL · TPOT · Request">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 4 }}>
              {(
                [
                  ['Request latency', model.p50, model.p75, model.p90, model.p99],
                  ['Time to first token', Math.round(model.p50 * 0.4), Math.round(model.p75 * 0.4), Math.round(model.p90 * 0.4), Math.round(model.p99 * 0.4)],
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
                        <div style={{ height: Math.max(4, (p[1] / row[4]) * 32), background: ['#1192e8', '#0f62fe', '#6929c4', '#a56eff'][j], borderRadius: '2px 2px 0 0' }} />
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

      <Section title="All models" count={M.length} style={{ paddingTop: 24 }} right={<span style={{ fontSize: 12, color: 'var(--text-helper)' }}>Click a row to drill into its charts above</span>}>
        <div className="dt-wrap">
          <DataTable
            columns={cols}
            rows={sorted}
            getKey={(m) => m.id}
            sortKey={sortKey as string}
            sortDir={sortDir}
            onSort={(kk) => {
              const key = kk as keyof SeedModel;
              if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
              else {
                setSortKey(key);
                setSortDir('desc');
              }
            }}
            rowActions={(m) => (
              <>
                <Btn kind="ghost" size="sm" icon="chartLine" title="View charts" onClick={() => setSel(m.id)} />
                <OverflowMenu
                  items={[
                    { icon: 'view', label: 'Open in traces', onClick: () => router.push('/logs') },
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
