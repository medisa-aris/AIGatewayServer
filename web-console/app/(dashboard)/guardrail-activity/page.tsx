'use client';

/**
 * Monitor → Guardrails Activity. Ported from screens-guardrail-activity.jsx.
 * Sankey enforcement flow + trend/outcome/latency charts. "Triggers by
 * guardrail" overlays the live `violations-by-rule` aggregate when available;
 * the rest uses seed analytics (no rollup endpoint for the flow). Marked ⚠️.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHead, Btn, Tag } from '@/components/ui';
import { ChartCard, TimeRange, StatStrip, Section } from '@/components/ui/screen';
import { LineChart, BarChart, DonutChart, SankeyChart, HeatStrip, fmtNum, DV_PALETTE, type SankeyNode, type SankeyLink } from '@/components/charts';
import { useAggregate } from '@/lib/hooks';
import { SEED, series } from '@/lib/seed';

const SANKEY_NODES: SankeyNode[] = [
  { id: 'llm_in', label: 'LLM Input', layer: 0, color: '#1192e8' },
  { id: 'llm_out', label: 'LLM Output', layer: 0, color: '#0f62fe' },
  { id: 'mcp_pre', label: 'MCP Pre-invoke', layer: 0, color: '#009d9a' },
  { id: 'mcp_post', label: 'MCP Post-invoke', layer: 0, color: '#005d5d' },
  { id: 'inject', label: 'Prompt Injection', layer: 1, color: '#fa4d56' },
  { id: 'mod', label: 'Content Moderation', layer: 1, color: '#b28600' },
  { id: 'pii', label: 'PII Redaction', layer: 1, color: '#1192e8' },
  { id: 'secrets', label: 'Secrets', layer: 1, color: '#6929c4' },
  { id: 'sql', label: 'SQL Sanitization', layer: 1, color: '#a56eff' },
  { id: 'mutated', label: 'Mutated', layer: 2, color: '#1192e8' },
  { id: 'flagged', label: 'Flagged', layer: 2, color: '#b28600' },
  { id: 'blocked', label: 'Blocked', layer: 2, color: '#fa4d56' },
];
const SANKEY_LINKS: SankeyLink[] = [
  { source: 'llm_in', target: 'inject', value: 6100 }, { source: 'llm_in', target: 'mod', value: 2100 },
  { source: 'llm_out', target: 'pii', value: 9800 }, { source: 'llm_out', target: 'mod', value: 2100 },
  { source: 'mcp_pre', target: 'sql', value: 1800 }, { source: 'mcp_post', target: 'secrets', value: 2900 },
  { source: 'inject', target: 'blocked', value: 4100 }, { source: 'inject', target: 'flagged', value: 2000 },
  { source: 'mod', target: 'blocked', value: 1500 }, { source: 'mod', target: 'flagged', value: 2700 },
  { source: 'pii', target: 'mutated', value: 9800 }, { source: 'secrets', target: 'mutated', value: 2400 },
  { source: 'secrets', target: 'blocked', value: 500 }, { source: 'sql', target: 'blocked', value: 500 },
  { source: 'sql', target: 'flagged', value: 1300 },
];

const RECENT = [
  { t: '12s ago', g: 'Prompt Injection', hook: 'LLM Input', act: 'Blocked', model: 'gpt-4o', user: 'web-app-prod', detail: 'Detected jailbreak pattern · "ignore previous instructions"' },
  { t: '48s ago', g: 'PII Redaction', hook: 'LLM Output', act: 'Mutated', model: 'claude-sonnet-4.5', user: 'support-bot', detail: 'Redacted 2 emails, 1 phone number' },
  { t: '1m ago', g: 'Secrets', hook: 'MCP Post', act: 'Mutated', model: 'gpt-4o', user: 'agent-runtime', detail: 'Masked AWS access key in tool output' },
  { t: '2m ago', g: 'Content Moderation', hook: 'LLM Input', act: 'Flagged', model: 'gemini-2.5-pro', user: 'analytics-team', detail: 'Category: harassment (0.71)' },
  { t: '3m ago', g: 'SQL Sanitization', hook: 'MCP Pre', act: 'Blocked', model: 'gpt-4o', user: 'data-pipeline', detail: 'Unsafe DROP statement rejected' },
  { t: '5m ago', g: 'Content Moderation', hook: 'LLM Output', act: 'Flagged', model: 'claude-sonnet-4.5', user: 'web-app-prod', detail: 'Category: self-harm (0.64)' },
];
const actColor: Record<string, 'red' | 'cyan' | 'warm' | 'green'> = { Blocked: 'red', Mutated: 'cyan', Flagged: 'warm', Allowed: 'green' };

export default function GuardrailActivityPage() {
  const router = useRouter();
  const G = SEED.guardrails;
  const days14 = SEED.days14;
  const hourly = SEED.overview.hourly;
  const [range, setRange] = useState('7d');
  const { data: liveTriggers } = useAggregate<{ label: string; value: number }[]>('violations-by-rule');

  const evalSeries = [
    { name: 'Evaluated', data: series(5, 14, 1950000, 140000, 9000) },
    { name: 'Mutated', data: series(7, 14, 620, 90) },
    { name: 'Flagged', data: series(11, 14, 840, 120) },
    { name: 'Blocked', data: series(9, 14, 230, 40) },
  ];
  const outcomes = [
    { label: 'Mutated', value: 12200 },
    { label: 'Flagged', value: 6000 },
    { label: 'Blocked', value: 6600 },
  ];
  const outcomeColors = ['#1192e8', '#b28600', '#fa4d56'];
  const triggers = liveTriggers?.length ? liveTriggers : G.filter((g) => g.triggers > 0).map((g) => ({ label: g.name, value: g.triggers }));
  const latency = G.filter((g) => g.p95 > 0).map((g) => ({ label: g.name.split(' ')[0]!, value: g.p95 }));

  return (
    <div>
      <PageHead
        title="Guardrails Activity"
        sub="Live view of how requests flow through content-safety hooks, which guardrails fire, and how they resolve."
        actions={
          <>
            <TimeRange value={range} onChange={setRange} ranges={['24h', '7d', '30d']} />
            <Btn kind="tertiary" size="sm" icon="settings" onClick={() => router.push('/guardrails')}>Configure</Btn>
          </>
        }
      />

      <Section style={{ paddingTop: 24 }}>
        <StatStrip
          stats={[
            { label: 'Evaluated (30d)', icon: 'shield', value: '58.6M', delta: '8.4%', dir: 'up' },
            { label: 'Mutated', icon: 'edit', value: '12.2k', delta: '12%', dir: 'up' },
            { label: 'Flagged', icon: 'flag', value: '6.0k' },
            { label: 'Blocked', icon: 'error', value: '6.6k', delta: '3.1%', dir: 'down' },
            { label: 'Avg added latency', icon: 'time', value: '34ms' },
          ]}
        />
      </Section>

      <Section style={{ paddingTop: 24 }}>
        <ChartCard
          title="Guardrail enforcement flow"
          sub="Of all guardrail triggers (30d): hook → guardrail → outcome · hover a node to isolate its flows"
          right={<Tag color="green" sm dot pulse>Live</Tag>}
        >
          <div className="legend" style={{ marginBottom: 8 }}>
            <span className="li"><span className="lk dot" style={{ background: '#1192e8' }} />Hooks</span>
            <span className="li"><span className="lk dot" style={{ background: '#6929c4' }} />Guardrails</span>
            <span className="li"><span className="lk dot" style={{ background: '#fa4d56' }} />Outcomes</span>
          </div>
          <SankeyChart nodes={SANKEY_NODES} links={SANKEY_LINKS} height={400} valueFormat={fmtNum} />
        </ChartCard>
      </Section>

      <Section style={{ paddingTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <ChartCard title="Evaluation & enforcement trend" sub="Daily volume · last 14 days" legend={[{ label: 'Evaluated', color: '#1192e8' }, { label: 'Mutated', color: '#009d9a' }, { label: 'Flagged', color: '#b28600' }, { label: 'Blocked', color: '#fa4d56' }]}>
            <LineChart series={[evalSeries[0]!]} labels={days14} height={120} area colors={['#1192e8']} yFormat={fmtNum} />
            <div style={{ height: 8 }} />
            <LineChart series={evalSeries.slice(1)} labels={days14} height={150} colors={['#009d9a', '#b28600', '#fa4d56']} yFormat={fmtNum} />
          </ChartCard>
          <ChartCard title="Outcome distribution" sub="Triggers by resolution · 30d">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <DonutChart data={outcomes} size={184} thickness={26} colors={outcomeColors} centerLabel="24.8k" centerSub="triggers" valueFormat={fmtNum} />
              <div style={{ width: '100%' }}>
                {outcomes.map((o, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '4px 0' }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: outcomeColors[i] }} />
                    <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{o.label}</span>
                    <span className="mono" style={{ fontWeight: 600 }}>{fmtNum(o.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>
        </div>
      </Section>

      <Section style={{ paddingTop: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <ChartCard title="Triggers by guardrail" sub={liveTriggers?.length ? 'Live · from violations' : '30-day totals'}>
            <BarChart horizontal height={210} data={triggers} barColor="#6929c4" yFormat={fmtNum} />
          </ChartCard>
          <ChartCard title="Added latency (P95)" sub="Overhead per guardrail, milliseconds">
            <BarChart horizontal height={210} data={latency} barColor="#009d9a" yFormat={(v) => v + 'ms'} />
          </ChartCard>
        </div>
      </Section>

      <Section style={{ paddingTop: 20 }}>
        <ChartCard title="Trigger volume by hour" sub="Today · darker = more triggers" right={<Tag color="green" sm dot pulse>Live</Tag>}>
          <HeatStrip data={hourly} cols={24} height={26} color="#6929c4" live />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: 'var(--text-helper)' }}>
            {['00:00', '06:00', '12:00', '18:00', '23:00'].map((t) => <span key={t}>{t}</span>)}
          </div>
        </ChartCard>
      </Section>

      <Section title="Recent guardrail events" style={{ paddingTop: 24 }} right={<Btn kind="ghost" size="sm" iconRight="arrowRight" onClick={() => router.push('/logs')}>Open in logs</Btn>}>
        <div className="dt-wrap">
          <table className="dt compact">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Time</th>
                <th>Guardrail</th>
                <th>Hook</th>
                <th>Action</th>
                <th>Model</th>
                <th>Caller</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {RECENT.map((r, i) => (
                <tr className="row" key={i}>
                  <td><span style={{ fontSize: 12, color: 'var(--text-helper)' }}>{r.t}</span></td>
                  <td><span className="cell-strong">{r.g}</span></td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{r.hook}</span></td>
                  <td><Tag color={actColor[r.act]} sm>{r.act}</Tag></td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{r.model}</span></td>
                  <td><span className="mono" style={{ fontSize: 12 }}>{r.user}</span></td>
                  <td><span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{r.detail}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
