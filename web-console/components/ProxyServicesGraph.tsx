'use client';

import { useState, useMemo, useRef, useEffect, useCallback, useReducer } from 'react';
import { useResourceList } from '@/lib/hooks';
import type {
  User, Organization, ProxyEndpoint, McpServer, Skill, GuardrailProfile,
  ProviderAccount, Model, GuardrailProfilePiiObject, PiiObject, Budget, RateLimit,
  UserProxyEndpoint, UserMcpServer, UserSkill, UserGuardrail,
  OrgProxyEndpoint, OrgMcpServer, OrgSkill, OrgGuardrail,
} from '@/lib/types';

/* ── palette ──────────────────────────────────────────────────────────────────── */

const NODE_COLOR: Record<string, string> = {
  subject:          '#4589ff',
  'proxy-endpoint': '#f59e0b',
  provider:         '#a855f7',
  model:            '#06b6d4',
  'mcp-server':     '#10b981',
  skill:            '#f97316',
  guardrail:        '#ef4444',
  pii:              '#ec4899',
  budget:           '#84cc16',
  'rate-limit':     '#14b8a6',
};

const TYPE_LABEL: Record<string, string> = {
  subject:          'Subject',
  'proxy-endpoint': 'Proxy Endpoint',
  provider:         'Provider Account',
  model:            'Model',
  'mcp-server':     'MCP Server',
  skill:            'Skill',
  guardrail:        'Guardrail',
  pii:              'PII Rule',
  budget:           'Budget',
  'rate-limit':     'Rate Limit',
};

/* ── helpers ──────────────────────────────────────────────────────────────────── */

function lighten(hex: string, amount = 0.42): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = (c: number) =>
    Math.min(255, Math.round(c + (255 - c) * amount)).toString(16).padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

function trunc(s: string, n = 16): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function spreadAngles(n: number, center: number, arc: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [center];
  return Array.from({ length: n }, (_, i) => center - arc / 2 + (i / (n - 1)) * arc);
}

/* ── graph types ──────────────────────────────────────────────────────────────── */

interface GNode { id: string; type: string; label: string; sublabel?: string; x: number; y: number; }
interface GEdge { from: string; to: string; primary?: boolean; }

/* ── link union types ─────────────────────────────────────────────────────────── */

export type EpLink   = UserProxyEndpoint | OrgProxyEndpoint;
export type McpLink  = UserMcpServer     | OrgMcpServer;
export type SkLink   = UserSkill         | OrgSkill;
export type GrdLink  = UserGuardrail     | OrgGuardrail;

/* ── graph builder ────────────────────────────────────────────────────────────── */

interface BuildArgs {
  subject:     User | Organization;
  epLinks:     EpLink[];
  mcpLinks:    McpLink[];
  skillLinks:  SkLink[];
  grdLinks:    GrdLink[];
  allEps:      ProxyEndpoint[];
  allMcps:     McpServer[];
  allSk:       Skill[];
  allGrd:      GuardrailProfile[];
  allProviders:ProviderAccount[];
  allModels:   Model[];
  allGppis:    GuardrailProfilePiiObject[];
  allPiis:     PiiObject[];
  allBudgets:  Budget[];
  allRlimits:  RateLimit[];
}

function buildGraph(a: BuildArgs): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const seen = new Set<string>();
  const subjId = `s-${a.subject.id}`;

  const add = (n: GNode) => {
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  };
  const link = (from: string, to: string, primary = false) =>
    edges.push({ from, to, primary });

  add({ id: subjId, type: 'subject', label: a.subject.name, x: 0, y: 0 });

  const R1 = 235, R2 = 165, R3 = 120;

  const assignedEps  = a.epLinks.map(l => a.allEps.find(e => e.id === l.proxy_endpoint_id)).filter(Boolean) as ProxyEndpoint[];
  const assignedMcps = a.mcpLinks.map(l => a.allMcps.find(m => m.id === l.mcp_server_id)).filter(Boolean) as McpServer[];
  const assignedSks  = a.skillLinks.map(l => a.allSk.find(s => s.id === l.skill_id)).filter(Boolean) as Skill[];
  const assignedGrds = a.grdLinks.map(l => a.allGrd.find(g => g.id === l.guardrail_profile_id)).filter(Boolean) as GuardrailProfile[];

  const SECTORS = [
    { base: -Math.PI / 4,     type: 'proxy-endpoint', items: assignedEps  },
    { base:  Math.PI / 4,     type: 'mcp-server',     items: assignedMcps },
    { base:  3 * Math.PI / 4, type: 'skill',          items: assignedSks  },
    { base: -3 * Math.PI / 4, type: 'guardrail',      items: assignedGrds },
  ] as const;

  for (const { base, type, items } of SECTORS) {
    if (!items.length) continue;
    const arc = Math.min(items.length * 0.55, Math.PI * 0.78);
    const θs = spreadAngles(items.length, base, arc);

    items.forEach((item, i) => {
      const θ = θs[i] ?? base;
      const x = R1 * Math.cos(θ), y = R1 * Math.sin(θ);
      const nid = `${type}-${item.id}`;
      let lbl = '', sub = '';

      if (type === 'proxy-endpoint') {
        const ep = item as ProxyEndpoint;
        lbl = ep.name?.trim() || `${ep.dialect}:${ep.port}`;
        sub = ep.dialect.toUpperCase();
      } else if (type === 'mcp-server') {
        const m = item as McpServer;
        lbl = m.name; sub = m.transport ?? '';
      } else if (type === 'skill') {
        const s = item as Skill;
        lbl = s.name; sub = s.version ? `v${s.version}` : '';
      } else {
        lbl = (item as GuardrailProfile).name;
      }

      add({ id: nid, type, label: lbl, sublabel: sub || undefined, x, y });
      link(subjId, nid, true);

      /* L2: provider accounts under proxy endpoints */
      if (type === 'proxy-endpoint') {
        const ep = item as ProxyEndpoint;
        const prov = ep.provider_account_id
          ? a.allProviders.find(p => p.id === ep.provider_account_id)
          : null;
        if (prov) {
          const px = x + R2 * Math.cos(θ ?? 0), py = y + R2 * Math.sin(θ ?? 0);
          const pid = `prov-${prov.id}`;
          add({ id: pid, type: 'provider', label: prov.name, sublabel: prov.provider_type, x: px, y: py });
          link(nid, pid);

          /* L3: active models for this provider (cap 4) */
          const models = a.allModels.filter(m => m.provider_id === prov.id && m.is_active).slice(0, 4);
          const mArc = Math.min(models.length * 0.45, 0.85);
          spreadAngles(models.length, θ, mArc).forEach((mθ, mi) => {
            const model = models[mi];
            if (!model) return;
            const mid = `mdl-${model.id}`;
            add({
              id: mid, type: 'model',
              label: trunc(model.name), sublabel: trunc(model.model_id, 20),
              x: px + R3 * Math.cos(mθ), y: py + R3 * Math.sin(mθ),
            });
            link(pid, mid);
          });
        }
      }

      /* L2: PII + budget + rate-limit under guardrail profiles */
      if (type === 'guardrail') {
        const grd = item as GuardrailProfile;
        const children: { id: string; type: string; label: string }[] = [];

        a.allGppis
          .filter(g => g.guardrail_profile_id === grd.id)
          .forEach(g => {
            const p = a.allPiis.find(p => p.id === g.pii_object_id);
            if (p) children.push({ id: `pii-${p.id}`, type: 'pii', label: p.name });
          });

        const budget = grd.budget_id ? a.allBudgets.find(b => b.id === grd.budget_id) : null;
        if (budget) children.push({ id: `bdg-${budget.id}`, type: 'budget', label: budget.name });

        const rl = grd.rate_limit_id ? a.allRlimits.find(r => r.id === grd.rate_limit_id) : null;
        if (rl) children.push({ id: `rl-${rl.id}`, type: 'rate-limit', label: rl.name });

        const cArc = Math.min(children.length * 0.55, 0.92);
        spreadAngles(children.length, θ, cArc).forEach((cθ, ci) => {
          const c = children[ci];
          if (!c) return;
          add({ id: c.id, type: c.type, label: c.label, x: x + R2 * Math.cos(cθ), y: y + R2 * Math.sin(cθ) });
          link(nid, c.id);
        });
      }
    });
  }

  return { nodes, edges };
}

/* ── view reducer (zoom + pan) ────────────────────────────────────────────────── */

type VS = { zoom: number; px: number; py: number };
type VA =
  | { type: 'wheel'; factor: number; mx: number; my: number }
  | { type: 'pan';   dx: number; dy: number }
  | { type: 'zoom';  dir: 1 | -1 }
  | { type: 'reset' };

function vr(s: VS, a: VA): VS {
  switch (a.type) {
    case 'wheel': {
      const z = Math.min(Math.max(s.zoom * a.factor, 0.1), 8);
      return { zoom: z, px: a.mx - (a.mx - s.px) * (z / s.zoom), py: a.my - (a.my - s.py) * (z / s.zoom) };
    }
    case 'pan':   return { ...s, px: s.px + a.dx, py: s.py + a.dy };
    case 'zoom':  return { ...s, zoom: Math.min(Math.max(s.zoom * (a.dir > 0 ? 1.2 : 0.83), 0.1), 8) };
    case 'reset': return { zoom: 1, px: 0, py: 0 };
  }
}

/* ── component props ──────────────────────────────────────────────────────────── */

export interface ProxyServicesGraphProps {
  open:        boolean;
  onClose:     () => void;
  subject:     User | Organization;
  subjectType: 'user' | 'org';
  epLinks:     EpLink[];
  mcpLinks:    McpLink[];
  skillLinks:  SkLink[];
  grdLinks:    GrdLink[];
  allEps:      ProxyEndpoint[];
  allMcps:     McpServer[];
  allSk:       Skill[];
  allGrd:      GuardrailProfile[];
}

/* ── styles ───────────────────────────────────────────────────────────────────── */

const IBTN: React.CSSProperties = {
  background: 'var(--layer-03, #c6c6c6)',
  border: '1px solid var(--border-strong, #8d8d8d)',
  borderRadius: 3, padding: '2px 9px', cursor: 'pointer',
  fontSize: 14, lineHeight: '1.65', color: 'var(--text-primary)', fontFamily: 'inherit',
};

/* ── component ────────────────────────────────────────────────────────────────── */

export function ProxyServicesGraph({
  open, onClose, subject, subjectType,
  epLinks, mcpLinks, skillLinks, grdLinks,
  allEps, allMcps, allSk, allGrd,
}: ProxyServicesGraphProps) {
  void subjectType;

  /* Hooks must be unconditional — SWR deduplicates with other panes' fetches */
  const { data: allProviders } = useResourceList<ProviderAccount>('provider-accounts', { limit: 500 });
  const { data: allModels }    = useResourceList<Model>('models',                       { limit: 500 });
  const { data: allGppis }     = useResourceList<GuardrailProfilePiiObject>('guardrail-profile-pii-objects', { limit: 500 });
  const { data: allPiis }      = useResourceList<PiiObject>('pii-objects',             { limit: 500 });
  const { data: allBudgets }   = useResourceList<Budget>('budgets',                    { limit: 500 });
  const { data: allRlimits }   = useResourceList<RateLimit>('rate-limits',             { limit: 500 });

  const [view, dispatch] = useReducer(vr, { zoom: 1, px: 0, py: 0 });
  const [svgSize, setSvgSize] = useState({ w: 800, h: 500 });
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!open || !svgRef.current) return;
    dispatch({ type: 'reset' });
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setSvgSize({ w: e.contentRect.width, h: e.contentRect.height });
    });
    ro.observe(svgRef.current);
    return () => ro.disconnect();
  }, [open]);

  const { nodes, edges } = useMemo(() => buildGraph({
    subject, epLinks, mcpLinks, skillLinks, grdLinks,
    allEps, allMcps, allSk, allGrd,
    allProviders, allModels, allGppis, allPiis, allBudgets, allRlimits,
  }), [subject, epLinks, mcpLinks, skillLinks, grdLinks, allEps, allMcps, allSk, allGrd,
       allProviders, allModels, allGppis, allPiis, allBudgets, allRlimits]);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const rect = svgRef.current!.getBoundingClientRect();
    dispatch({
      type: 'wheel',
      factor: e.deltaY < 0 ? 1.12 : 0.88,
      mx: e.clientX - rect.left - svgSize.w / 2,
      my: e.clientY - rect.top  - svgSize.h / 2,
    });
  }, [svgSize]);

  const onMD = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const onMM = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    dispatch({ type: 'pan', dx: e.clientX - lastMouse.current.x, dy: e.clientY - lastMouse.current.y });
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onMU = useCallback(() => { dragging.current = false; }, []);

  /* Hooks above; early return below is safe */
  if (!open) return null;

  const cx = svgSize.w / 2 + view.px;
  const cy = svgSize.h / 2 + view.py;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--ui-background, #fff)',
        borderRadius: 8, width: '92vw', height: '90vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--layer-02, #e0e0e0)', flexShrink: 0, gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>Service Graph</span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {subject.name}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {/* Legend */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 8px', marginRight: 10 }}>
              {Object.entries(NODE_COLOR).map(([t, c]) => (
                <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0, display: 'inline-block' }} />
                  {TYPE_LABEL[t]}
                </span>
              ))}
            </div>
            {/* Zoom controls */}
            <button style={IBTN} onClick={() => dispatch({ type: 'zoom', dir: 1 })}>+</button>
            <button style={IBTN} onClick={() => dispatch({ type: 'zoom', dir: -1 })}>−</button>
            <button style={{ ...IBTN, fontSize: 12, padding: '2px 10px' }} onClick={() => dispatch({ type: 'reset' })} title="Reset view">
              Reset
            </button>
            <button style={{ ...IBTN, marginLeft: 6 }} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── SVG canvas ── */}
        <svg
          ref={svgRef}
          style={{ flex: 1, display: 'block', cursor: dragging.current ? 'grabbing' : 'grab', background: 'var(--layer-01, #f4f4f4)' }}
          onWheel={handleWheel}
          onMouseDown={onMD}
          onMouseMove={onMM}
          onMouseUp={onMU}
          onMouseLeave={onMU}
        >
          <defs>
            {Object.entries(NODE_COLOR).map(([t, c]) => (
              <radialGradient key={t} id={`g-${t}`} cx="38%" cy="35%" r="65%">
                <stop offset="0%" stopColor={lighten(c)} />
                <stop offset="100%" stopColor={c} />
              </radialGradient>
            ))}
            <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.18" />
            </filter>
          </defs>

          <g transform={`translate(${cx},${cy}) scale(${view.zoom})`}>
            {/* Edges */}
            {edges.map(e => {
              const f = nodes.find(n => n.id === e.from);
              const t = nodes.find(n => n.id === e.to);
              if (!f || !t) return null;
              return (
                <line
                  key={`${e.from}→${e.to}`}
                  x1={f.x} y1={f.y} x2={t.x} y2={t.y}
                  stroke={e.primary ? '#9ca3af' : '#d1d5db'}
                  strokeWidth={e.primary ? 1.8 : 1.2}
                  strokeOpacity={0.6}
                  strokeDasharray={e.primary ? undefined : '5 3'}
                />
              );
            })}

            {/* Nodes */}
            {nodes.map(node => {
              const r = node.type === 'subject' ? 36 : 22;
              return (
                <g key={node.id} transform={`translate(${node.x},${node.y})`} style={{ userSelect: 'none' }}>
                  <circle r={r} fill={`url(#g-${node.type})`} stroke="white" strokeWidth={2.5} filter="url(#shadow)" />
                  <text
                    y={r + 14}
                    textAnchor="middle"
                    fontSize={node.type === 'subject' ? 12 : 10.5}
                    fill="var(--text-primary, #161616)"
                    fontWeight={node.type === 'subject' ? 700 : 500}
                  >
                    {trunc(node.label, 16)}
                  </text>
                  {node.sublabel && (
                    <text y={r + 26} textAnchor="middle" fontSize={9} fill="var(--text-secondary, #525252)">
                      {trunc(node.sublabel, 20)}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* ── Footer ── */}
        <div style={{
          padding: '3px 14px', fontSize: 10.5, color: 'var(--text-secondary)',
          borderTop: '1px solid var(--border-subtle)', background: 'var(--layer-02, #e0e0e0)', flexShrink: 0,
        }}>
          {nodes.length} nodes · {edges.length} connections · scroll to zoom · drag to pan
        </div>
      </div>
    </div>
  );
}
