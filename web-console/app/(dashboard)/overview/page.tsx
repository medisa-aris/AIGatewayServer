'use client';

/**
 * Monitor → Overview dashboard. Ported from screens-overview.jsx.
 *
 * Hybrid data: KPI headline numbers, the cost trend, requests-by-endpoint,
 * top-models ranking and the hourly heat strip come from the BFF aggregate
 * (`/api/aggregate/overview`, which paginates past the 500-row cap). The
 * enterprise-scale visuals the CRUD API can't reproduce (provider-share donut,
 * LLM-vs-MCP split, guardrail summary) fall back to seed data.
 */

import { useState } from 'react';
import { Btn, Tag, PageHead, Kpi, Tabs } from '@/components/ui';
import { ChartCard, TimeRange, RankList, useReorder, type RankItem } from '@/components/ui/screen';
import { LineChart, BarChart, DonutChart, DistBar, HeatStrip, LiveLine, fmtNum, usd, DV_PALETTE } from '@/components/charts';
import { useAggregate } from '@/lib/hooks';
import { SEED } from '@/lib/seed';

interface OverviewAgg {
  kpis: { totalRequests: number; totalCost: number; errorRate: number; avgLatency: number; uniqueUsers: number; cacheHitRate: number };
  costByDay: { date: string; value: number }[];
  requestsByModel: { label: string; value: number }[];
  requestsByEndpoint: { label: string; value: number }[];
  topUsers: { label: string; value: number }[];
  heatStrip: number[];
}

export default function OverviewPage() {
  const O = SEED.overview;
  const { data: live } = useAggregate<OverviewAgg>('overview');
  const [range, setRange] = useState('30d');
  const [rankTab, setRankTab] = useState('models');
  const [brushNote, setBrushNote] = useState<string | null>(null);

  // KPI definitions; headline value overridden by live data when present.
  const k = live?.kpis;
  const kpiDefs: { key: string; label: string; icon: string; sparkColor: string; value: string; unit: string; seed: keyof typeof O.kpis }[] = [
    { key: 'cost', label: 'Total Cost', icon: 'money', sparkColor: '#1192e8', value: k ? usd(k.totalCost) : O.kpis.cost.value, unit: k ? '' : O.kpis.cost.unit, seed: 'cost' },
    { key: 'llmCalls', label: 'Requests', icon: 'model', sparkColor: '#0f62fe', value: k ? fmtNum(k.totalRequests) : O.kpis.llmCalls.value, unit: k ? '' : O.kpis.llmCalls.unit, seed: 'llmCalls' },
    { key: 'mcpCalls', label: 'MCP Calls', icon: 'server', sparkColor: '#6929c4', value: O.kpis.mcpCalls.value, unit: O.kpis.mcpCalls.unit, seed: 'mcpCalls' },
    { key: 'errorRate', label: 'Error Rate', icon: 'warningAlt', sparkColor: '#fa4d56', value: k ? String(k.errorRate) : O.kpis.errorRate.value, unit: '%', seed: 'errorRate' },
    { key: 'cacheHit', label: 'Cache Hit Rate', icon: 'zap', sparkColor: '#009d9a', value: k ? String(k.cacheHitRate) : O.kpis.cacheHit.value, unit: '%', seed: 'cacheHit' },
    { key: 'p95', label: 'Avg Latency', icon: 'time', sparkColor: '#a56eff', value: k ? fmtNum(k.avgLatency) : O.kpis.p95.value, unit: 'ms', seed: 'p95' },
  ];
  const [order, handlers] = useReorder(kpiDefs.map((d) => d.key));
  const defByKey = Object.fromEntries(kpiDefs.map((d) => [d.key, d]));

  // Cost trend: prefer real daily cost; fall back to seed's multi-provider series.
  const realCost = live?.costByDay ?? [];
  const useReal = realCost.length > 1;
  const costSeries = useReal ? [{ name: 'Cost', data: realCost.map((p) => p.value) }] : O.costTrend.series;
  const costLabels = useReal ? realCost.map((p) => p.date.slice(5)) : O.costTrend.labels;

  const endpoints = live?.requestsByEndpoint?.length ? live.requestsByEndpoint : O.requestsByEndpoint;
  const heat = live?.heatStrip?.length === 24 ? live.heatStrip : O.hourly;

  const ranks: Record<string, RankItem[]> = {
    models: live?.requestsByModel?.length ? live.requestsByModel : O.topModels,
    users: live?.topUsers?.length ? live.topUsers : O.topUsers,
    mcp: O.topMcp,
  };

  return (
    <div>
      <PageHead
        title="Overview"
        sub="Real-time platform health across providers and models. Drag KPI tiles to reorder; drag across the cost chart to zoom a date range."
        actions={
          <>
            <TimeRange value={range} onChange={setRange} />
            <Btn kind="tertiary" size="sm" icon="download2">Export</Btn>
          </>
        }
      />

      {/* KPI row */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 16 }}>
          {order.map((key) => {
            const def = defByKey[key]!;
            const seed = O.kpis[def.seed];
            return (
              <div key={key} {...handlers(key)}>
                <Kpi
                  label={def.label}
                  icon={def.icon}
                  value={def.value}
                  unit={def.unit}
                  delta={seed.delta}
                  deltaDir={seed.dir as 'up' | 'down'}
                  spark={seed.spark}
                  sparkColor={def.sparkColor}
                  draggable
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Cost trend + provider donut */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <ChartCard
            title="Cost of inference"
            sub={brushNote || (useReal ? 'Daily spend (live) · drag to zoom a date range' : 'Daily spend by provider · drag to zoom')}
            right={<Tag color="cyan" sm>{useReal ? usd(realCost.reduce((s, p) => s + p.value, 0)) : '$184.2k'} total</Tag>}
            legend={useReal ? [{ label: 'Cost', color: DV_PALETTE[0]! }] : O.costTrend.series.map((s, i) => ({ label: s.name, color: DV_PALETTE[i]! }))}
          >
            <LineChart
              series={costSeries}
              labels={costLabels}
              height={260}
              area
              yFormat={usd}
              brushable
              onBrush={(r) => setBrushNote(`Zoomed ${costLabels[r[0]]} – ${costLabels[r[1]]}`)}
            />
          </ChartCard>
          <ChartCard title="Spend by provider" sub="Share of 30-day cost">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <DonutChart data={O.topProviders} size={188} thickness={26} centerLabel="$184k" centerSub="8 providers" valueFormat={(v) => v + '%'} />
              <div style={{ width: '100%' }}>
                {O.topProviders.slice(0, 5).map((p, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: DV_PALETTE[i] }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{p.label}</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{p.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Calls + endpoints + errors */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 16 }}>
          <ChartCard title="Incoming requests" sub="LLM vs MCP calls · last 14 days" legend={[{ label: 'LLM calls', color: '#1192e8' }, { label: 'MCP calls', color: '#6929c4' }]}>
            <LineChart series={O.callsTrend.series} labels={O.callsTrend.labels} height={220} colors={['#1192e8', '#6929c4']} yFormat={fmtNum} />
          </ChartCard>
          <ChartCard title="Requests by endpoint" sub="volume">
            <BarChart horizontal height={220} data={endpoints} barColor="#0f62fe" yFormat={fmtNum} />
          </ChartCard>
          <ChartCard title="Error breakdown" sub="by status code">
            <BarChart horizontal height={220} data={O.errorBreakdown} barColor="#fa4d56" yFormat={fmtNum} />
          </ChartCard>
        </div>
      </div>

      {/* Guardrails + rankings */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ChartCard title="Guardrails activity" sub="Triggers across all hooks · 30 days">
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              {([['Flagged', O.guardrailSummary.flagged, '#b28600'], ['Mutated', O.guardrailSummary.mutated, '#1192e8'], ['Blocked', O.guardrailSummary.blocked, '#fa4d56']] as const).map((s, i) => (
                <div key={i}>
                  <div style={{ fontSize: 26, fontWeight: 300, fontVariantNumeric: 'tabular-nums', color: s[2] }}>{fmtNum(s[1])}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{s[0]}</div>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 14 }}>
              <DistBar segments={O.guardrailSummary.rankings} height={10} />
            </div>
            <RankList items={O.guardrailSummary.rankings} valueFormat={fmtNum} />
          </ChartCard>
          <ChartCard
            title="Top usage"
            right={<Tabs contained active={rankTab} onChange={setRankTab} tabs={[{ id: 'models', label: 'Models' }, { id: 'users', label: 'Users' }, { id: 'mcp', label: 'MCP' }]} />}
          >
            <div style={{ marginTop: 4 }}>
              <RankList items={ranks[rankTab]!} valueFormat={fmtNum} color={rankTab === 'models' ? undefined : '#0f62fe'} />
            </div>
          </ChartCard>
        </div>
      </div>

      {/* Live monitor + hourly heat */}
      <div className="section">
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
          <ChartCard title="Live throughput" sub="Gateway requests per second · updating in real time" right={<Tag color="green" sm dot pulse>Live</Tag>}>
            <LiveLine height={200} color="#1192e8" base={3200} vol={520} interval={1200} label="req/s" />
          </ChartCard>
          <ChartCard title="Request volume by hour" sub="Today · darker = busier" right={<Tag color="green" sm dot pulse>Live</Tag>}>
            <HeatStrip data={heat} cols={24} height={28} color="#1192e8" live />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-helper)' }}>
              {['00:00', '06:00', '12:00', '18:00', '23:00'].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
