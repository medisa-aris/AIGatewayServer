'use client';

/**
 * Proxy Services — map users and organizations to eligible proxy services.
 *
 * Two tabs:
 *  - Users: select an active user visible from the root organization.
 *    Assign/revoke proxy endpoints, MCP servers, skills, and guardrail profiles.
 *  - Organizations: same, but the subject is an organization.
 *
 * DB backing: migration 013 junction tables.
 */

import { useState, useMemo, useCallback } from 'react';
import { PageHead, Tabs, Btn, Tag } from '@/components/ui';
import { StatStrip } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { createResource, deleteResource } from '@/lib/api/resources';
import { ProxyServicesGraph } from '@/components/ProxyServicesGraph';
import type {
  User, Organization, ApiKey, Model,
  ProxyEndpoint, McpServer, Skill, GuardrailProfile,
  UserProxyEndpoint, UserMcpServer, UserSkill, UserGuardrail,
  OrgProxyEndpoint, OrgMcpServer, OrgSkill, OrgGuardrail,
  RouteTestCheck, RouteTestReport,
} from '@/lib/types';

/* ── constants ───────────────────────────────────────────────────────────────── */

const PAGE_TABS = [
  { id: 'users', label: 'Users',         icon: 'users' },
  { id: 'orgs',  label: 'Organizations', icon: 'flow'  },
];

/* ── helpers ─────────────────────────────────────────────────────────────────── */

function endpointLabel(ep: ProxyEndpoint) {
  return ep.name?.trim() || `${ep.dialect.toUpperCase()} :${ep.port}`;
}

function parentOf(o: Organization): string | null {
  return (o.settings as { parent_org_id?: string } | null)?.parent_org_id ?? null;
}

function findRootOrgId(orgs: Organization[], startOrgId: string): string {
  const byId = new Map(orgs.map(o => [o.id, o]));
  let current = startOrgId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break;
    visited.add(current);
    const org = byId.get(current);
    if (!org) break;
    const pid = parentOf(org);
    if (!pid || !byId.has(pid)) return current;
    current = pid;
  }
  return startOrgId;
}

function collectSubtreeIds(orgs: Organization[], rootId: string): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const o of orgs) {
    const pid = parentOf(o);
    if (pid) {
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid)!.push(o.id);
    }
  }
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.add(id);
    for (const childId of childrenOf.get(id) ?? []) {
      if (!result.has(childId)) queue.push(childId);
    }
  }
  return result;
}

/* ── Avatar ──────────────────────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  '#0f62fe', '#6929c4', '#009d9a', '#1192e8', '#ee538b',
  '#b28600', '#fa4d56', '#198038', '#005d5d', '#8a3ffc',
];

function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = avatarColor(name);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: size, height: size, borderRadius: '50%',
      background: bg, color: '#fff',
      fontSize: size * 0.35, fontWeight: 700, letterSpacing: '0.03em',
      flexShrink: 0, userSelect: 'none',
    }}>
      {initials(name)}
    </span>
  );
}

/* ── DialectIcon ─────────────────────────────────────────────────────────────── */

const DIALECT_META: Record<string, { bg: string; label: string }> = {
  openai:        { bg: '#161616', label: 'OA' },
  anthropic:     { bg: '#8b4513', label: 'An' },
  azure:         { bg: '#0072c6', label: 'Az' },
  ollama:        { bg: '#2d6a4f', label: 'Ol' },
  kimi:          { bg: '#006d5b', label: 'Ki' },
  virtual_model: { bg: '#0f62fe', label: 'VM' },
};

function DialectIcon({ dialect }: { dialect: string }) {
  const meta = DIALECT_META[dialect] ?? { bg: '#525252', label: dialect.slice(0, 2).toUpperCase() };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 26, height: 26, borderRadius: 4,
      background: meta.bg, color: '#fff',
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0,
    }}>
      {meta.label}
    </span>
  );
}

/* ── TestingModal ────────────────────────────────────────────────────────────── */

const STATUS_COLOR: Record<string, string> = {
  pass: '#24a148', fail: '#da1e28', warn: '#f1c21b', skip: '#8d8d8d',
};
const STATUS_ICON: Record<string, string> = {
  pass: 'checkmarkFill', fail: 'error', warn: 'warningAlt', skip: 'info',
};
const STEP_LABEL: Record<string, string> = {
  resolve_user:     'Resolve user',
  endpoint_access:  'Endpoint access',
  mcp_access:       'MCP server access',
  skill_access:     'Skill access',
  guardrail_pii:    'PII guardrail',
  guardrail_budget: 'Budget guardrail',
  guardrail_rate:   'Rate limit',
};

function DetailBlock({ details }: { details: Record<string, unknown> }) {
  return (
    <pre style={{
      margin: '6px 0 0', padding: '8px 10px', borderRadius: 2,
      background: 'var(--layer-02, #e8e8e8)', fontSize: 11, lineHeight: 1.55,
      color: 'var(--text-primary)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
    }}>
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}

function TraceRow({ check }: { check: RouteTestCheck }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[check.status] ?? '#8d8d8d';
  const icon  = STATUS_ICON[check.status]  ?? 'info';
  const label = STEP_LABEL[check.step]     ?? check.step;
  return (
    <div style={{
      borderBottom: '1px solid var(--border-subtle)', padding: '8px 0',
      cursor: check.details ? 'pointer' : 'default',
    }} onClick={() => check.details && setOpen(v => !v)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={14} style={{ color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140 }}>{label}</span>
        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: color + '22', color, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{check.status}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{check.message}</span>
        {check.details && <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
      </div>
      {open && check.details && <DetailBlock details={check.details} />}
    </div>
  );
}

function TestingModal({ onClose, allEps, allMcps, userId, orgId }: {
  onClose: () => void;
  allEps: ProxyEndpoint[];
  allMcps: McpServer[];
  userId?: string;
  orgId?: string;
}) {
  const keyFilter: Record<string, string> = userId
    ? { user_id: userId,  limit: '500' }
    : orgId ? { org_id: orgId, limit: '500' } : {};
  const { data: rawKeys } = useResourceList<ApiKey>('api-keys', keyFilter);
  const apiKeys = rawKeys.filter(k => k.is_active);

  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [message,       setMessage]       = useState('');
  const [mcpId,         setMcpId]         = useState('');
  const [endpointId,    setEndpointId]    = useState('');
  const [modelId,       setModelId]       = useState('');
  const [loading,       setLoading]       = useState(false);
  const [report,        setReport]        = useState<RouteTestReport | null>(null);
  const [error,         setError]         = useState<string | null>(null);

  const activeEps = allEps.filter(e => e.is_active);
  const selectedEp = activeEps.find(ep => ep.id === endpointId) ?? null;
  const providerAccountId = selectedEp?.provider_account_id ?? '';
  const modelFilter = providerAccountId ? { provider_id: providerAccountId, limit: '100' } : { limit: '1' };
  const { data: rawModels } = useResourceList<Model>('models', modelFilter);
  const availableModels = providerAccountId ? rawModels.filter(m => m.is_active) : [];

  function handleEndpointChange(id: string) { setEndpointId(id); setModelId(''); }

  async function runTest() {
    if (!selectedKeyId) return;
    setLoading(true); setError(null); setReport(null);
    try {
      const res = await fetch('/api/route-test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyId: selectedKeyId, message, mcpServerId: mcpId || undefined, endpointId: endpointId || undefined }),
      });
      const json = (await res.json()) as RouteTestReport | { error?: string };
      if (!res.ok) setError((json as { error?: string }).error ?? `Error ${res.status}`);
      else setReport(json as RouteTestReport);
    } catch (e) { setError(String(e)); }
    finally { setLoading(false); }
  }

  void modelId;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--layer-01, #f4f4f4)', borderRadius: 4, width: '100%', maxWidth: 900, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 16px 48px rgba(0,0,0,0.3)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--layer-02, white)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="play" size={16} style={{ color: 'var(--interactive-01, #0f62fe)' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Route Request Testing</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <Icon name="close" size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, overflow: 'hidden' }}>
          <div style={{ borderRight: '1px solid var(--border-subtle)', padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                API Key <span style={{ color: '#da1e28' }}>*</span>
              </label>
              <select value={selectedKeyId} onChange={e => setSelectedKeyId(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 2, background: 'var(--field-bg, white)', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="">— Select an API key —</option>
                {apiKeys.map(k => <option key={k.id} value={k.id}>{k.name || k.id.slice(0, 8)}{k.scope ? ` · ${k.scope}` : ''}</option>)}
              </select>
              {apiKeys.length === 0 && <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>No active API keys for this {userId ? 'user' : 'organization'}.</p>}
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Message</label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Enter the user's message…" rows={5} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 2, background: 'var(--field-bg, white)', color: 'var(--text-primary)', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Proxy Endpoint</label>
              <select value={endpointId} onChange={e => handleEndpointChange(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 2, background: 'var(--field-bg, white)', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="">— None (skip check) —</option>
                {activeEps.map(ep => <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>)}
              </select>
            </div>
            {endpointId && availableModels.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>Model</label>
                <select value={modelId} onChange={e => setModelId(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 2, background: 'var(--field-bg, white)', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                  <option value="">— Default —</option>
                  {availableModels.map(m => <option key={m.id} value={m.model_id}>{m.name || m.model_id}</option>)}
                </select>
              </div>
            )}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>MCP Server</label>
              <select value={mcpId} onChange={e => setMcpId(e.target.value)} style={{ width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid var(--border-strong)', borderRadius: 2, background: 'var(--field-bg, white)', color: 'var(--text-primary)', boxSizing: 'border-box' }}>
                <option value="">— None (skip check) —</option>
                {allMcps.filter(m => m.is_active).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <button onClick={runTest} disabled={loading || !selectedKeyId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 16px', fontSize: 13, fontWeight: 600, background: loading || !selectedKeyId ? 'var(--interactive-03, #8d8d8d)' : 'var(--interactive-01, #0f62fe)', color: 'white', border: 'none', borderRadius: 2, cursor: loading || !selectedKeyId ? 'not-allowed' : 'pointer' }}>
              <Icon name={loading ? 'refresh' : 'play'} size={13} />
              {loading ? 'Running…' : 'Run Test'}
            </button>
          </div>

          <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!report && !error && !loading && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-placeholder)' }}>
                <Icon name="route" size={40} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: 13 }}>Fill in the form and click Run Test to see the trace</span>
              </div>
            )}
            {loading && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', gap: 8, fontSize: 13 }}>
              <Icon name="refresh" size={16} style={{ color: 'var(--interactive-01, #0f62fe)' }} />Running validation pipeline…
            </div>}
            {error && <div style={{ padding: '12px 14px', borderRadius: 2, background: '#fff1f1', border: '1px solid #da1e28', color: '#da1e28', fontSize: 13 }}>
              <Icon name="error" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />{error}
            </div>}
            {report && !loading && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 2, marginBottom: 16, background: report.allowed ? '#defbe6' : '#fff1f1', border: `1px solid ${report.allowed ? '#24a148' : '#da1e28'}` }}>
                  <Icon name={report.allowed ? 'checkmarkFill' : 'error'} size={16} style={{ color: report.allowed ? '#24a148' : '#da1e28', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: report.allowed ? '#24a148' : '#da1e28' }}>{report.allowed ? 'Request would be allowed' : 'Request would be blocked'}</div>
                    {(report.user_id || report.org_id) && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {report.user_id && <>{report.user_name || report.user_id}</>}
                        {report.user_id && report.org_id && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
                        {report.org_id && <>{report.org_name || report.org_id}</>}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 13 }}>{report.checks.map((check, i) => <TraceRow key={i} check={check} />)}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ServiceCard ─────────────────────────────────────────────────────────────── */

function CardHeader({ icon, title, count, onAdd, addLabel = 'Add', unassigned, adding }: {
  icon: string; title: string; count: number;
  onAdd?: (id: string) => Promise<void>;
  addLabel?: string;
  unassigned?: { id: string; label: string }[];
  adding?: boolean;
}) {
  const [open, setOpen] = useState(false);

  async function pick(id: string) {
    if (!id || !onAdd) return;
    setOpen(false);
    await onAdd(id);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--layer-02, #f4f4f4)' }}>
      <Icon name={icon} size={13} style={{ color: 'var(--text-secondary)' }} />
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', flex: 1 }}>{title}</span>
      {count > 0 && (
        <span style={{ fontSize: 11, fontWeight: 600, minWidth: 18, textAlign: 'center', background: 'var(--tag-background, #e0e0e0)', color: 'var(--text-secondary)', borderRadius: 10, padding: '1px 6px' }}>{count}</span>
      )}
      {onAdd && (unassigned?.length ?? 0) > 0 && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setOpen(o => !o)} disabled={adding} title={addLabel} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 4px', display: 'flex', alignItems: 'center', color: 'var(--interactive-01, #0f62fe)', borderRadius: 2 }}>
            <Icon name="add" size={14} />
          </button>
          {open && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
              <div style={{ position: 'absolute', right: 0, top: '100%', zIndex: 50, minWidth: 200, background: 'var(--layer-01, white)', border: '1px solid var(--border-strong)', borderRadius: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                {unassigned!.map(item => (
                  <div key={item.id} onClick={() => pick(item.id)} style={{ padding: '8px 12px', fontSize: 13, cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--layer-hover-01)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    {item.label}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── EndpointCard ────────────────────────────────────────────────────────────── */

function EndpointCard({ links, allEps, onAdd, onRemove }: {
  links: { id: string; targetId: string }[];
  allEps: ProxyEndpoint[];
  onAdd: (id: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const assignedIds = new Set(links.map(l => l.targetId));
  const unassigned = allEps.filter(e => !assignedIds.has(e.id)).map(e => ({ id: e.id, label: endpointLabel(e) }));

  async function handleAdd(id: string) { setAdding(true); try { await onAdd(id); } finally { setAdding(false); } }
  async function handleRemove(linkId: string) { setRemoving(linkId); try { await onRemove(linkId); } finally { setRemoving(null); } }

  const assigned = links.map(l => ({ link: l, ep: allEps.find(e => e.id === l.targetId) }));

  return (
    <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>
      <CardHeader icon="globe" title="Proxy Endpoints" count={links.length} onAdd={handleAdd} unassigned={unassigned} adding={adding} />
      {assigned.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 12 }}>No endpoints assigned</div>
      ) : (
        <div>
          {assigned.map(({ link, ep }) => ep ? (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--layer-hover-01)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <DialectIcon dialect={ep.dialect} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{endpointLabel(ep)}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: ep.is_active ? '#24a148' : '#8d8d8d' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ep.is_active ? 'healthy' : 'inactive'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-helper)' }}>·</span>
                  <span style={{ fontSize: 11, color: 'var(--text-helper)', fontFamily: 'var(--font-mono)' }}>{ep.dialect}</span>
                </div>
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-helper)', flexShrink: 0 }}>:{ep.port}</span>
              <button onClick={() => handleRemove(link.id)} disabled={removing === link.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', opacity: removing === link.id ? 0.4 : 0.6, display: 'flex', alignItems: 'center' }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

/* ── McpCard ─────────────────────────────────────────────────────────────────── */

function McpCard({ links, allMcps, onAdd, onRemove }: {
  links: { id: string; targetId: string }[];
  allMcps: McpServer[];
  onAdd: (id: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const assignedIds = new Set(links.map(l => l.targetId));
  const unassigned = allMcps.filter(m => !assignedIds.has(m.id)).map(m => ({ id: m.id, label: m.name }));

  async function handleAdd(id: string) { setAdding(true); try { await onAdd(id); } finally { setAdding(false); } }
  async function handleRemove(linkId: string) { setRemoving(linkId); try { await onRemove(linkId); } finally { setRemoving(null); } }

  const assigned = links.map(l => ({ link: l, mcp: allMcps.find(m => m.id === l.targetId) }));

  return (
    <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>
      <CardHeader icon="server" title="MCP Servers" count={links.length} onAdd={handleAdd} unassigned={unassigned} adding={adding} />
      {assigned.length === 0 ? (
        <div style={{ padding: '28px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'var(--text-placeholder)' }}>
          <Icon name="server" size={28} style={{ opacity: 0.18 }} />
          <span style={{ fontSize: 12 }}>No MCP servers assigned</span>
          {unassigned.length > 0 && (
            <button onClick={async () => { }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--interactive-01, #0f62fe)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name="add" size={12} />Assign server
            </button>
          )}
        </div>
      ) : (
        <div>
          {assigned.map(({ link, mcp }) => mcp ? (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--layer-hover-01)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ width: 26, height: 26, borderRadius: 4, background: 'var(--layer-03, #e0e0e0)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="server" size={13} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mcp.name}</div>
                {mcp.transport && <div style={{ fontSize: 11, color: 'var(--text-helper)', marginTop: 1 }}>{mcp.transport}</div>}
              </div>
              <button onClick={() => handleRemove(link.id)} disabled={removing === link.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', opacity: removing === link.id ? 0.4 : 0.6, display: 'flex', alignItems: 'center' }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

/* ── SkillCard ───────────────────────────────────────────────────────────────── */

function SkillCard({ links, allSk, onAdd, onRemove }: {
  links: { id: string; targetId: string }[];
  allSk: Skill[];
  onAdd: (id: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const assignedIds = new Set(links.map(l => l.targetId));
  const unassigned = allSk.filter(s => !assignedIds.has(s.id)).map(s => ({ id: s.id, label: `${s.name} v${s.version}` }));

  async function handleAdd(id: string) { setAdding(true); try { await onAdd(id); } finally { setAdding(false); } }
  async function handleRemove(linkId: string) { setRemoving(linkId); try { await onRemove(linkId); } finally { setRemoving(null); } }

  const assigned = links.map(l => ({ link: l, skill: allSk.find(s => s.id === l.targetId) }));

  return (
    <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>
      <CardHeader icon="idea" title="Skills" count={links.length} onAdd={handleAdd} unassigned={unassigned} adding={adding} />
      {assigned.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 12 }}>No skills granted</div>
      ) : (
        <div>
          {assigned.map(({ link, skill }) => skill ? (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--layer-hover-01)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <Icon name="idea" size={13} style={{ color: 'var(--brand, #0f62fe)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{skill.name}</span>
              <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 10, background: '#defbe6', color: '#198038', fontWeight: 600 }}>v{skill.version}</span>
              <button onClick={() => handleRemove(link.id)} disabled={removing === link.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', opacity: removing === link.id ? 0.4 : 0.6, display: 'flex', alignItems: 'center' }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

/* ── GuardrailCard ───────────────────────────────────────────────────────────── */

function GuardrailCard({ links, allGrd, onAdd, onRemove }: {
  links: { id: string; targetId: string }[];
  allGrd: GuardrailProfile[];
  onAdd: (id: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const assignedIds = new Set(links.map(l => l.targetId));
  const unassigned = allGrd.filter(g => !assignedIds.has(g.id)).map(g => ({ id: g.id, label: g.name }));

  async function handleAdd(id: string) { setAdding(true); try { await onAdd(id); } finally { setAdding(false); } }
  async function handleRemove(linkId: string) { setRemoving(linkId); try { await onRemove(linkId); } finally { setRemoving(null); } }

  const assigned = links.map(l => ({ link: l, grd: allGrd.find(g => g.id === l.targetId) }));

  function guardrailSub(g: GuardrailProfile): string {
    const parts: string[] = [];
    if (g.pii_rules) parts.push('PII redaction');
    if (g.content_policy) parts.push('Content policy');
    if (g.topic_filters) parts.push('Topic filters');
    if (g.description) return g.description;
    return parts.join(' · ') || 'Guardrail profile';
  }

  return (
    <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>
      <CardHeader icon="shield" title="Guardrails" count={links.length} onAdd={handleAdd} unassigned={unassigned} adding={adding} />
      {assigned.length === 0 ? (
        <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text-placeholder)', fontSize: 12 }}>No guardrails assigned</div>
      ) : (
        <div>
          {assigned.map(({ link, grd }) => grd ? (
            <div key={link.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--layer-hover-01)')}
              onMouseLeave={e => (e.currentTarget.style.background = '')}>
              <div style={{ width: 26, height: 26, borderRadius: 4, background: '#e8f4fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="shield" size={13} style={{ color: 'var(--brand, #0f62fe)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{grd.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-helper)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{guardrailSub(grd)}</div>
              </div>
              <button onClick={() => handleRemove(link.id)} disabled={removing === link.id} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text-secondary)', opacity: removing === link.id ? 0.4 : 0.6, display: 'flex', alignItems: 'center' }}>
                <Icon name="close" size={11} />
              </button>
            </div>
          ) : null)}
        </div>
      )}
    </div>
  );
}

/* ── UserDetailPane ──────────────────────────────────────────────────────────── */

function UserDetailPane({ user, orgId, allEps, activeMcps, activeSk, activeGrd }: {
  user: User;
  orgId: string | undefined;
  allEps: ProxyEndpoint[];
  activeMcps: McpServer[];
  activeSk: Skill[];
  activeGrd: GuardrailProfile[];
}) {
  const activeEps = useMemo(() => allEps.filter(e => e.is_active), [allEps]);

  const { data: userEps,    mutate: muEps  } = useResourceList<UserProxyEndpoint>('user-proxy-endpoints', { user_id: user.id, limit: 500 });
  const { data: userMcps,   mutate: muMcps } = useResourceList<UserMcpServer>    ('user-mcp-servers',     { user_id: user.id, limit: 500 });
  const { data: userSkills, mutate: muSk   } = useResourceList<UserSkill>        ('user-skills',          { user_id: user.id, limit: 500 });
  const { data: userGrds,   mutate: muGrd  } = useResourceList<UserGuardrail>    ('user-guardrails',      { user_id: user.id, limit: 500 });

  const epLinks  = useMemo(() => userEps.map(l    => ({ id: l.id, targetId: l.proxy_endpoint_id })),   [userEps]);
  const mcpLinks = useMemo(() => userMcps.map(l   => ({ id: l.id, targetId: l.mcp_server_id })),       [userMcps]);
  const skLinks  = useMemo(() => userSkills.map(l => ({ id: l.id, targetId: l.skill_id })),             [userSkills]);
  const grdLinks = useMemo(() => userGrds.map(l   => ({ id: l.id, targetId: l.guardrail_profile_id })), [userGrds]);

  const [graphOpen,   setGraphOpen]   = useState(false);
  const [testingOpen, setTestingOpen] = useState(false);

  const addEp  = useCallback(async (id: string) => { await createResource('user-proxy-endpoints', { user_id: user.id, proxy_endpoint_id: id }); muEps(); },  [user.id, muEps]);
  const addMcp = useCallback(async (id: string) => { await createResource('user-mcp-servers',     { user_id: user.id, mcp_server_id: id });       muMcps(); }, [user.id, muMcps]);
  const addSk  = useCallback(async (id: string) => { await createResource('user-skills',          { user_id: user.id, skill_id: id });             muSk(); },   [user.id, muSk]);
  const addGrd = useCallback(async (id: string) => { await createResource('user-guardrails',      { user_id: user.id, guardrail_profile_id: id }); muGrd(); },  [user.id, muGrd]);

  const rmEp  = useCallback(async (lId: string) => { await deleteResource('user-proxy-endpoints', lId); muEps(); },  [muEps]);
  const rmMcp = useCallback(async (lId: string) => { await deleteResource('user-mcp-servers',     lId); muMcps(); }, [muMcps]);
  const rmSk  = useCallback(async (lId: string) => { await deleteResource('user-skills',          lId); muSk(); },   [muSk]);
  const rmGrd = useCallback(async (lId: string) => { await deleteResource('user-guardrails',      lId); muGrd(); },  [muGrd]);

  void orgId;

  const displayName = user.name || user.email;
  const totalAssignments = epLinks.length + mcpLinks.length + skLinks.length + grdLinks.length;

  return (
    <>
      <ProxyServicesGraph
        open={graphOpen} onClose={() => setGraphOpen(false)}
        subject={user} subjectType="user"
        epLinks={userEps} mcpLinks={userMcps} skillLinks={userSkills} grdLinks={userGrds}
        allEps={allEps} allMcps={activeMcps} allSk={activeSk} allGrd={activeGrd}
      />
      {testingOpen && <TestingModal onClose={() => setTestingOpen(false)} allEps={allEps} allMcps={activeMcps} userId={user.id} />}

      {/* Subject header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={displayName} size={48} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{displayName}</div>
            {user.name && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{user.email}</div>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Tag color="cyan" sm>{user.org_id?.slice(0, 6) ?? 'Org'}</Tag>
              <Tag color="green" sm dot>{user.is_active ? 'Active' : 'Inactive'}</Tag>
              {totalAssignments > 0 && <Tag color="blue" sm>{totalAssignments} assignments</Tag>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <Btn kind="ghost" size="sm" icon="play" onClick={() => setTestingOpen(true)}>Test routing</Btn>
          <Btn kind="ghost" size="sm" icon="route" onClick={() => setGraphOpen(true)}>View graph</Btn>
          <Btn kind="primary" size="sm" icon="edit">Edit assignments</Btn>
        </div>
      </div>

      {/* 2×2 service cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <EndpointCard links={epLinks} allEps={activeEps} onAdd={addEp} onRemove={rmEp} />
        <McpCard      links={mcpLinks} allMcps={activeMcps} onAdd={addMcp} onRemove={rmMcp} />
        <SkillCard    links={skLinks} allSk={activeSk} onAdd={addSk} onRemove={rmSk} />
        <GuardrailCard links={grdLinks} allGrd={activeGrd} onAdd={addGrd} onRemove={rmGrd} />
      </div>
    </>
  );
}

/* ── OrgDetailPane ───────────────────────────────────────────────────────────── */

function OrgDetailPane({ org, allEps, activeMcps, activeSk, activeGrd }: {
  org: Organization;
  allEps: ProxyEndpoint[];
  activeMcps: McpServer[];
  activeSk: Skill[];
  activeGrd: GuardrailProfile[];
}) {
  const activeEps = useMemo(() => allEps.filter(e => e.is_active), [allEps]);

  const { data: orgEps,    mutate: muEps  } = useResourceList<OrgProxyEndpoint>('org-proxy-endpoints', { org_id: org.id, limit: 500 });
  const { data: orgMcps,   mutate: muMcps } = useResourceList<OrgMcpServer>    ('org-mcp-servers',     { org_id: org.id, limit: 500 });
  const { data: orgSkills, mutate: muSk   } = useResourceList<OrgSkill>        ('org-skills',          { org_id: org.id, limit: 500 });
  const { data: orgGrds,   mutate: muGrd  } = useResourceList<OrgGuardrail>    ('org-guardrails',      { org_id: org.id, limit: 500 });

  const epLinks  = useMemo(() => orgEps.map(l    => ({ id: l.id, targetId: l.proxy_endpoint_id })),   [orgEps]);
  const mcpLinks = useMemo(() => orgMcps.map(l   => ({ id: l.id, targetId: l.mcp_server_id })),       [orgMcps]);
  const skLinks  = useMemo(() => orgSkills.map(l => ({ id: l.id, targetId: l.skill_id })),             [orgSkills]);
  const grdLinks = useMemo(() => orgGrds.map(l   => ({ id: l.id, targetId: l.guardrail_profile_id })), [orgGrds]);

  const [graphOpen,   setGraphOpen]   = useState(false);
  const [testingOpen, setTestingOpen] = useState(false);

  const addEp  = useCallback(async (id: string) => { await createResource('org-proxy-endpoints', { org_id: org.id, proxy_endpoint_id: id }); muEps(); },  [org.id, muEps]);
  const addMcp = useCallback(async (id: string) => { await createResource('org-mcp-servers',     { org_id: org.id, mcp_server_id: id });       muMcps(); }, [org.id, muMcps]);
  const addSk  = useCallback(async (id: string) => { await createResource('org-skills',          { org_id: org.id, skill_id: id });             muSk(); },   [org.id, muSk]);
  const addGrd = useCallback(async (id: string) => { await createResource('org-guardrails',      { org_id: org.id, guardrail_profile_id: id }); muGrd(); },  [org.id, muGrd]);

  const rmEp  = useCallback(async (lId: string) => { await deleteResource('org-proxy-endpoints', lId); muEps(); },  [muEps]);
  const rmMcp = useCallback(async (lId: string) => { await deleteResource('org-mcp-servers',     lId); muMcps(); }, [muMcps]);
  const rmSk  = useCallback(async (lId: string) => { await deleteResource('org-skills',          lId); muSk(); },   [muSk]);
  const rmGrd = useCallback(async (lId: string) => { await deleteResource('org-guardrails',      lId); muGrd(); },  [muGrd]);

  const totalAssignments = epLinks.length + mcpLinks.length + skLinks.length + grdLinks.length;

  return (
    <>
      <ProxyServicesGraph
        open={graphOpen} onClose={() => setGraphOpen(false)}
        subject={org} subjectType="org"
        epLinks={orgEps} mcpLinks={orgMcps} skillLinks={orgSkills} grdLinks={orgGrds}
        allEps={allEps} allMcps={activeMcps} allSk={activeSk} allGrd={activeGrd}
      />
      {testingOpen && <TestingModal onClose={() => setTestingOpen(false)} allEps={allEps} allMcps={activeMcps} orgId={org.id} />}

      {/* Subject header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar name={org.name} size={48} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.2 }}>{org.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{org.slug}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <Tag color="cyan" sm>{org.tier ?? 'Standard'}</Tag>
              <Tag color="green" sm dot>{org.is_active ? 'Active' : 'Inactive'}</Tag>
              {totalAssignments > 0 && <Tag color="blue" sm>{totalAssignments} assignments</Tag>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
          <Btn kind="ghost" size="sm" icon="play" onClick={() => setTestingOpen(true)}>Test routing</Btn>
          <Btn kind="ghost" size="sm" icon="route" onClick={() => setGraphOpen(true)}>View graph</Btn>
          <Btn kind="primary" size="sm" icon="edit">Edit assignments</Btn>
        </div>
      </div>

      {/* 2×2 service cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <EndpointCard links={epLinks} allEps={activeEps} onAdd={addEp} onRemove={rmEp} />
        <McpCard      links={mcpLinks} allMcps={activeMcps} onAdd={addMcp} onRemove={rmMcp} />
        <SkillCard    links={skLinks} allSk={activeSk} onAdd={addSk} onRemove={rmSk} />
        <GuardrailCard links={grdLinks} allGrd={activeGrd} onAdd={addGrd} onRemove={rmGrd} />
      </div>
    </>
  );
}

/* ── EmptySelection ──────────────────────────────────────────────────────────── */

function EmptySelection({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--text-placeholder)', minHeight: 320 }}>
      <Icon name={icon} size={36} style={{ opacity: 0.25 }} />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}

/* ── UserServicesPane ────────────────────────────────────────────────────────── */

function UserServicesPane({ orgId }: { orgId: string | undefined }) {
  const [search, setSearch] = useState('');
  const [selId,  setSelId]  = useState<string | null>(null);

  const { user: sessionUser } = useSession();
  const sessionOrgId = sessionUser?.orgId ?? orgId;

  const { data: allOrgs  } = useResourceList<Organization>('organizations', { limit: 500 });
  const { data: rawUsers } = useResourceList<User>('users', { limit: 500 });

  const { data: allUserEps  } = useResourceList<UserProxyEndpoint>('user-proxy-endpoints', { limit: 500 });
  const { data: allUserMcps } = useResourceList<UserMcpServer>    ('user-mcp-servers',     { limit: 500 });
  const { data: allUserSk   } = useResourceList<UserSkill>        ('user-skills',          { limit: 500 });
  const { data: allUserGrd  } = useResourceList<UserGuardrail>    ('user-guardrails',      { limit: 500 });

  const rootOrgId = useMemo(
    () => sessionOrgId && allOrgs.length ? findRootOrgId(allOrgs, sessionOrgId) : sessionOrgId,
    [allOrgs, sessionOrgId],
  );
  const orgSubtreeIds = useMemo(
    () => rootOrgId && allOrgs.length ? collectSubtreeIds(allOrgs, rootOrgId) : new Set<string>(),
    [allOrgs, rootOrgId],
  );

  const users = useMemo(() => rawUsers.filter(u =>
    u.is_active &&
    (orgSubtreeIds.size === 0 || orgSubtreeIds.has(u.org_id)) &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()))
  ), [rawUsers, orgSubtreeIds, search]);

  const assignmentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allUserEps)  map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
    for (const r of allUserMcps) map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
    for (const r of allUserSk)   map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
    for (const r of allUserGrd)  map.set(r.user_id, (map.get(r.user_id) ?? 0) + 1);
    return map;
  }, [allUserEps, allUserMcps, allUserSk, allUserGrd]);

  const mappedUserCount   = useMemo(() => new Set([...allUserEps, ...allUserMcps, ...allUserSk, ...allUserGrd].map(r => r.user_id)).size, [allUserEps, allUserMcps, allUserSk, allUserGrd]);
  const endpointsInUse    = useMemo(() => new Set(allUserEps.map(r => r.proxy_endpoint_id)).size, [allUserEps]);
  const mcpCount          = useMemo(() => new Set(allUserMcps.map(r => r.mcp_server_id)).size, [allUserMcps]);
  const skillTotal        = allUserSk.length;
  const guardrailCount    = useMemo(() => new Set(allUserGrd.map(r => r.guardrail_profile_id)).size, [allUserGrd]);

  const sel = users.find(u => u.id === selId) ?? null;

  const { data: allEps  } = useResourceList<ProxyEndpoint>   ('proxy-endpoints',    { limit: 500 });
  const { data: allMcps } = useResourceList<McpServer>        ('mcp-servers',        { org_id: orgId, limit: 500 });
  const { data: allSk   } = useResourceList<Skill>            ('skills',             { org_id: orgId, limit: 500 });
  const { data: allGrd  } = useResourceList<GuardrailProfile> ('guardrail-profiles', { org_id: orgId, limit: 500 });

  const activeMcps = useMemo(() => allMcps.filter(m => m.is_active),            [allMcps]);
  const activeSk   = useMemo(() => allSk.filter(s => s.status !== 'deprecated'), [allSk]);
  const activeGrd  = useMemo(() => allGrd.filter(g => g.is_active),              [allGrd]);

  return (
    <div style={{ padding: '0 var(--s-07) var(--s-07)' }}>
      {/* Stat strip */}
      <StatStrip stats={[
        { label: 'Mapped users',       icon: 'users',   value: String(mappedUserCount) },
        { label: 'Endpoints in use',   icon: 'globe',   value: String(endpointsInUse) },
        { label: 'MCP servers',        icon: 'server',  value: String(mcpCount) },
        { label: 'Skills granted',     icon: 'idea',    value: String(skillTotal) },
        { label: 'Guardrail profiles', icon: 'shield',  value: String(guardrailCount) },
      ]} />

      {/* Master-detail layout */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 4, overflow: 'hidden', minHeight: 520 }}>
        {/* Left: user list */}
        <div style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', background: 'var(--layer-01)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="search" placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)}
              className="inp sm" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {users.length === 0
              ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-placeholder)', textAlign: 'center' }}>No users found</div>
              : users.map(u => {
                const uOrg = allOrgs.find(o => o.id === u.org_id);
                const count = assignmentCounts.get(u.id) ?? 0;
                const name  = u.name || u.email;
                return (
                  <div key={u.id}
                    className={`md-item${selId === u.id ? ' sel' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => setSelId(u.id === selId ? null : u.id)}
                  >
                    <Avatar name={name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {u.name ? u.email : ''}{u.name && uOrg ? ' · ' : ''}{uOrg?.name ?? ''}
                      </div>
                    </div>
                    {count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, minWidth: 20, textAlign: 'center', padding: '2px 6px', borderRadius: 10, background: 'var(--brand, #0f62fe)', color: '#fff', flexShrink: 0 }}>
                        {count}
                      </span>
                    )}
                  </div>
                );
              })
            }
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-helper)' }}>
            {users.length} of {rawUsers.length} users
          </div>
        </div>

        {/* Right: detail */}
        <div style={{ padding: 20, overflowY: 'auto', background: 'var(--layer-02)' }}>
          {sel ? (
            <UserDetailPane key={sel.id} user={sel} orgId={orgId} allEps={allEps} activeMcps={activeMcps} activeSk={activeSk} activeGrd={activeGrd} />
          ) : (
            <EmptySelection icon="users" message="Select a user to manage their proxy service access" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── OrgServicesPane ─────────────────────────────────────────────────────────── */

function OrgServicesPane() {
  const [search, setSearch] = useState('');
  const [selId,  setSelId]  = useState<string | null>(null);

  const { user: sessionUser } = useSession();
  const { data: rawOrgs } = useResourceList<Organization>('organizations', { limit: 500 });

  const rootOrgId = useMemo(
    () => sessionUser?.orgId && rawOrgs.length ? findRootOrgId(rawOrgs, sessionUser.orgId) : sessionUser?.orgId,
    [rawOrgs, sessionUser?.orgId],
  );
  const orgSubtreeIds = useMemo(
    () => rootOrgId && rawOrgs.length ? collectSubtreeIds(rawOrgs, rootOrgId) : new Set<string>(),
    [rawOrgs, rootOrgId],
  );
  const orgs = useMemo(() => rawOrgs.filter(o =>
    o.is_active &&
    (orgSubtreeIds.size === 0 || orgSubtreeIds.has(o.id)) &&
    (!search || o.name.toLowerCase().includes(search.toLowerCase()) || o.slug.toLowerCase().includes(search.toLowerCase()))
  ), [rawOrgs, orgSubtreeIds, search]);

  const { data: allOrgEps  } = useResourceList<OrgProxyEndpoint>('org-proxy-endpoints', { limit: 500 });
  const { data: allOrgMcps } = useResourceList<OrgMcpServer>    ('org-mcp-servers',     { limit: 500 });
  const { data: allOrgSk   } = useResourceList<OrgSkill>        ('org-skills',          { limit: 500 });
  const { data: allOrgGrd  } = useResourceList<OrgGuardrail>    ('org-guardrails',      { limit: 500 });

  const orgAssignmentCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allOrgEps)  map.set(r.org_id, (map.get(r.org_id) ?? 0) + 1);
    for (const r of allOrgMcps) map.set(r.org_id, (map.get(r.org_id) ?? 0) + 1);
    for (const r of allOrgSk)   map.set(r.org_id, (map.get(r.org_id) ?? 0) + 1);
    for (const r of allOrgGrd)  map.set(r.org_id, (map.get(r.org_id) ?? 0) + 1);
    return map;
  }, [allOrgEps, allOrgMcps, allOrgSk, allOrgGrd]);

  const mappedOrgCount = useMemo(() => new Set([...allOrgEps, ...allOrgMcps, ...allOrgSk, ...allOrgGrd].map(r => r.org_id)).size, [allOrgEps, allOrgMcps, allOrgSk, allOrgGrd]);
  const endpointsInUse = useMemo(() => new Set(allOrgEps.map(r => r.proxy_endpoint_id)).size, [allOrgEps]);
  const mcpCount       = useMemo(() => new Set(allOrgMcps.map(r => r.mcp_server_id)).size, [allOrgMcps]);
  const skillTotal     = allOrgSk.length;
  const guardrailCount = useMemo(() => new Set(allOrgGrd.map(r => r.guardrail_profile_id)).size, [allOrgGrd]);

  const sel = orgs.find(o => o.id === selId) ?? null;

  const { data: allEps  } = useResourceList<ProxyEndpoint>   ('proxy-endpoints',    { limit: 500 });
  const { data: allMcps } = useResourceList<McpServer>        ('mcp-servers',        { org_id: selId ?? undefined, limit: 500 });
  const { data: allSk   } = useResourceList<Skill>            ('skills',             { org_id: selId ?? undefined, limit: 500 });
  const { data: allGrd  } = useResourceList<GuardrailProfile> ('guardrail-profiles', { org_id: selId ?? undefined, limit: 500 });

  const activeMcps = useMemo(() => allMcps.filter(m => m.is_active),            [allMcps]);
  const activeSk   = useMemo(() => allSk.filter(s => s.status !== 'deprecated'), [allSk]);
  const activeGrd  = useMemo(() => allGrd.filter(g => g.is_active),              [allGrd]);

  return (
    <div style={{ padding: '0 var(--s-07) var(--s-07)' }}>
      <StatStrip stats={[
        { label: 'Mapped orgs',        icon: 'flow',    value: String(mappedOrgCount) },
        { label: 'Endpoints in use',   icon: 'globe',   value: String(endpointsInUse) },
        { label: 'MCP servers',        icon: 'server',  value: String(mcpCount) },
        { label: 'Skills granted',     icon: 'idea',    value: String(skillTotal) },
        { label: 'Guardrail profiles', icon: 'shield',  value: String(guardrailCount) },
      ]} />

      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0, border: '1px solid var(--border-subtle)', borderRadius: 4, overflow: 'hidden', minHeight: 520 }}>
        <div style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', background: 'var(--layer-01)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
            <input type="search" placeholder="Search organizations…" value={search} onChange={e => setSearch(e.target.value)}
              className="inp sm" style={{ width: '100%', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {orgs.length === 0
              ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-placeholder)', textAlign: 'center' }}>No organizations found</div>
              : orgs.map(o => {
                const count = orgAssignmentCounts.get(o.id) ?? 0;
                return (
                  <div key={o.id}
                    className={`md-item${selId === o.id ? ' sel' : ''}`}
                    style={{ display: 'flex', alignItems: 'center', gap: 10 }}
                    onClick={() => setSelId(o.id === selId ? null : o.id)}
                  >
                    <Avatar name={o.name} size={32} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{o.slug}</div>
                    </div>
                    {count > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 6px', borderRadius: 10, background: 'var(--brand, #0f62fe)', color: '#fff', flexShrink: 0 }}>
                        {count}
                      </span>
                    )}
                  </div>
                );
              })
            }
          </div>
          <div style={{ padding: '8px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-helper)' }}>
            {orgs.length} of {rawOrgs.length} organizations
          </div>
        </div>

        <div style={{ padding: 20, overflowY: 'auto', background: 'var(--layer-02)' }}>
          {sel ? (
            <OrgDetailPane key={sel.id} org={sel} allEps={allEps} activeMcps={activeMcps} activeSk={activeSk} activeGrd={activeGrd} />
          ) : (
            <EmptySelection icon="flow" message="Select an organization to manage its proxy service access" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────────── */

export default function ProxyServicesPage() {
  const orgId = useDefaultOrgId();
  const [tab, setTab] = useState('users');

  const tabsWithCounts = PAGE_TABS; // counts rendered inside each pane stat strip

  return (
    <div>
      <PageHead
        title="Proxy Services"
        sub="Map users and organizations to eligible proxy endpoints, MCP servers, skills, and guardrail profiles."
        actions={
          <>
            <Btn kind="tertiary" size="sm" icon="download2">Export</Btn>
            <Btn kind="primary" size="sm" icon="add">Add mapping</Btn>
          </>
        }
      />

      <div style={{ marginTop: 20, marginBottom: 16, padding: '0 var(--s-07)' }}>
        <Tabs active={tab} onChange={setTab} tabs={tabsWithCounts} />
      </div>

      {tab === 'users'
        ? <UserServicesPane orgId={orgId} />
        : <OrgServicesPane />
      }
    </div>
  );
}
