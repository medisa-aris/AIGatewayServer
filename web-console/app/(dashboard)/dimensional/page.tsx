'use client';

/**
 * Monitor → Dimensional Viewer. Person / Model / MCP / Organization tabs.
 * Master-detail explorer driven by seed analytics (per-entity cross-cuts of
 * logs, PII, MCP, skills, budget, rate limits) — the CRUD API has no rollup
 * endpoints for these slices. Marked ⚠️ (accuracy bounded by seed/500-row).
 */

import { useState } from 'react';
import { PageHead, Tabs, Tag } from '@/components/ui';
import { ChartCard, StatStrip, Section, RankList } from '@/components/ui/screen';
import { ProviderMark } from '@/components/Icon';
import { LineChart, DonutChart, DistBar, RadialGauge, fmtNum, usd } from '@/components/charts';
import { SEED, series } from '@/lib/seed';

const TABS = [
  { id: 'person', label: 'Person', icon: 'users' },
  { id: 'model', label: 'Model', icon: 'model' },
  { id: 'mcp', label: 'MCP', icon: 'server' },
  { id: 'org', label: 'Organization', icon: 'flow' },
];

const PII_TYPES = [
  { label: 'Email', value: 4200 },
  { label: 'Phone', value: 2100 },
  { label: 'Name', value: 1800 },
  { label: 'Credit Card', value: 640 },
  { label: 'SSN / Gov ID', value: 310 },
];

function MasterDetail<T extends { id: string; name: string; sub?: string }>({
  items,
  selId,
  onSelect,
  children,
}: {
  items: T[];
  selId: string;
  onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const [q, setQ] = useState('');
  const filtered = items.filter((i) => (i.name + ' ' + (i.sub ?? '')).toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
      <div className="tile" style={{ padding: 0, maxHeight: 620, overflow: 'auto' }}>
        <div style={{ padding: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          <input className="inp sm" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {filtered.map((i) => (
          <div key={i.id} className={`md-item ${selId === i.id ? 'sel' : ''}`} onClick={() => onSelect(i.id)}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>{i.name}</div>
            {i.sub && <div style={{ fontSize: 11, color: 'var(--text-helper)' }}>{i.sub}</div>}
          </div>
        ))}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function DimensionalPage() {
  const [tab, setTab] = useState('person');
  const [personId, setPersonId] = useState(SEED.users[0]!.id);
  const [modelId, setModelId] = useState(SEED.models[0]!.id);
  const [mcpId, setMcpId] = useState(SEED.mcpServers[0]!.id);
  const [groupBy, setGroupBy] = useState('division');

  const labels = SEED.days14;

  return (
    <div>
      <PageHead title="Dimensional Viewer" sub="Drill into metrics per person, model, MCP server, or organization unit. Search a dimension, then explore its cross-cutting usage." />
      <Section style={{ paddingTop: 16 }}>
        <Tabs active={tab} onChange={setTab} tabs={TABS} />
      </Section>

      {tab === 'person' && (
        <Section style={{ paddingTop: 16 }}>
          <MasterDetail
            items={SEED.users.map((u) => ({ id: u.id, name: u.name, sub: u.email }))}
            selId={personId}
            onSelect={setPersonId}
          >
            {(() => {
              const u = SEED.users.find((x) => x.id === personId)!;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <StatStrip
                    stats={[
                      { label: 'Requests (30d)', icon: 'activity', value: fmtNum(1_200_000) },
                      { label: 'Spend', icon: 'money', value: usd(4120) },
                      { label: 'PII hits', icon: 'lock', value: '318' },
                      { label: 'MCP calls', icon: 'server', value: fmtNum(54000) },
                    ]}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <ChartCard title="Request activity" sub={`${u.name} · last 14 days`}>
                      <LineChart series={[{ name: 'Requests', data: series(u.id.length + 3, 14, 90000, 12000, 1500) }]} labels={labels} height={200} area colors={['#1192e8']} yFormat={fmtNum} />
                    </ChartCard>
                    <ChartCard title="PII detected" sub="By object type">
                      <DonutChart data={PII_TYPES} size={170} thickness={24} centerLabel="318" centerSub="hits" valueFormat={fmtNum} />
                    </ChartCard>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                    <ChartCard title="Budget" sub="Monthly cap">
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <RadialGauge value={4120} max={8000} size={150} color="#1192e8" label={`${Math.round((4120 / 8000) * 100)}%`} sub="$4.1k / $8.0k" />
                      </div>
                    </ChartCard>
                    <ChartCard title="MCP usage" sub="Calls per server">
                      <RankList items={SEED.mcpServers.slice(0, 5).map((s) => ({ label: s.name, value: s.calls }))} valueFormat={fmtNum} />
                    </ChartCard>
                    <ChartCard title="Roles & skills" sub="Granted access">
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {u.roles.map((r) => <Tag key={r} color="cyan" sm>{r}</Tag>)}
                        {SEED.skills.slice(0, 3).map((s) => <Tag key={s.name} color="purple" sm>{s.name}</Tag>)}
                      </div>
                    </ChartCard>
                  </div>
                </div>
              );
            })()}
          </MasterDetail>
        </Section>
      )}

      {tab === 'model' && (
        <Section style={{ paddingTop: 16 }}>
          <MasterDetail
            items={SEED.models.map((m) => ({ id: m.id, name: m.name, sub: m.provider }))}
            selId={modelId}
            onSelect={setModelId}
          >
            {(() => {
              const m = SEED.models.find((x) => x.id === modelId)!;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <StatStrip
                    stats={[
                      { label: 'Requests', icon: 'activity', value: fmtNum(m.reqs) },
                      { label: 'Cost', icon: 'money', value: usd(m.cost) },
                      { label: 'People using', icon: 'users', value: '42' },
                      { label: 'P99', icon: 'time', value: m.p99 + 'ms' },
                    ]}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
                    <ChartCard title="Requests over time" sub={`${m.name} · ${m.provider}`}>
                      <LineChart series={[{ name: 'Requests', data: series(m.reqs % 999, 14, m.reqs / 14, m.reqs / 200, 0) }]} labels={labels} height={200} area colors={['#0f62fe']} yFormat={fmtNum} />
                    </ChartCard>
                    <ChartCard title="Top callers" sub="People using this model">
                      <RankList items={SEED.overview.topUsers.slice(0, 5)} valueFormat={fmtNum} color="#0f62fe" />
                    </ChartCard>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <ChartCard title="Used alongside (MCP & skills)" sub="Co-occurrence">
                      <RankList items={SEED.mcpServers.slice(0, 4).map((s) => ({ label: s.name, value: s.calls }))} valueFormat={fmtNum} color="#009d9a" />
                    </ChartCard>
                    <ChartCard title="Governance" sub="Rate limits & budgets">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {SEED.rateRules.map((r) => (
                          <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{r.name}</span>
                            <span className="mono">{fmtNum(r.rpm)} rpm</span>
                          </div>
                        ))}
                      </div>
                    </ChartCard>
                  </div>
                </div>
              );
            })()}
          </MasterDetail>
        </Section>
      )}

      {tab === 'mcp' && (
        <Section style={{ paddingTop: 16 }}>
          <MasterDetail
            items={SEED.mcpServers.map((s) => ({ id: s.id, name: s.name, sub: `${s.cat} · ${s.tools} tools` }))}
            selId={mcpId}
            onSelect={setMcpId}
          >
            {(() => {
              const s = SEED.mcpServers.find((x) => x.id === mcpId)!;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <StatStrip
                    stats={[
                      { label: 'Tool calls', icon: 'server', value: fmtNum(s.calls) },
                      { label: 'Users', icon: 'users', value: String(s.users) },
                      { label: 'Tools', icon: 'code', value: String(s.tools) },
                      { label: 'PII hits', icon: 'lock', value: '1.2k' },
                    ]}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <ChartCard title="PII by object type" sub={`Detected in ${s.name} I/O`}>
                      <DonutChart data={PII_TYPES} size={184} thickness={26} centerLabel="1.2k" centerSub="hits" valueFormat={fmtNum} />
                    </ChartCard>
                    <ChartCard title="People using" sub="Distribution of callers">
                      <div style={{ marginBottom: 12 }}>
                        <DistBar segments={SEED.overview.topUsers.slice(0, 5).map((u, i) => ({ label: String(u.label), value: u.value, color: ['#1192e8', '#0f62fe', '#6929c4', '#009d9a', '#ee538b'][i] }))} height={10} />
                      </div>
                      <RankList items={SEED.overview.topUsers.slice(0, 5)} valueFormat={fmtNum} />
                    </ChartCard>
                  </div>
                  <ChartCard title="Tool-call volume" sub="Last 14 days">
                    <LineChart series={[{ name: 'Calls', data: series(s.calls % 777, 14, s.calls / 14, s.calls / 120, 0) }]} labels={labels} height={180} area colors={['#6929c4']} yFormat={fmtNum} />
                  </ChartCard>
                </div>
              );
            })()}
          </MasterDetail>
        </Section>
      )}

      {tab === 'org' && (
        <Section style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Group by</span>
            <Tabs contained active={groupBy} onChange={setGroupBy} tabs={[{ id: 'division', label: 'Division' }, { id: 'unit', label: 'Unit' }]} />
          </div>
          <StatStrip
            stats={[
              { label: 'Tokens (30d)', icon: 'model', value: '48.6M' },
              { label: 'Budget used', icon: 'money', value: '$184k' },
              { label: 'Rate headroom', icon: 'gauge', value: '62%' },
              { label: 'Guardrails caught', icon: 'shield', value: '24.8k' },
            ]}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginTop: 16 }}>
            <ChartCard title="Token consumption by group" sub={`Per ${groupBy}`}>
              <RankList
                items={[
                  { label: 'Engineering', value: 21_400_000, color: '#1192e8' },
                  { label: 'Data Platform', value: 12_800_000, color: '#0f62fe' },
                  { label: 'Customer Support', value: 8_300_000, color: '#009d9a' },
                  { label: 'Sales', value: 4_100_000, color: '#6929c4' },
                  { label: 'Research', value: 2_000_000, color: '#ee538b' },
                ]}
                valueFormat={fmtNum}
              />
            </ChartCard>
            <ChartCard title="Share of spend" sub="By group">
              <DonutChart
                data={[
                  { label: 'Engineering', value: 92 },
                  { label: 'Data Platform', value: 48 },
                  { label: 'Support', value: 26 },
                  { label: 'Sales', value: 12 },
                  { label: 'Research', value: 6 },
                ]}
                size={184}
                thickness={26}
                centerLabel="$184k"
                centerSub="total"
                valueFormat={(v) => '$' + v + 'k'}
              />
            </ChartCard>
          </div>
        </Section>
      )}
    </div>
  );
}
