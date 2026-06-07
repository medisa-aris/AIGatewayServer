'use client';

/**
 * Proxy Services — map users and organizations to eligible proxy services.
 *
 * Two tabs:
 *  - Users: select an active user visible from the root organization (the
 *    session user's org is traced up to the root, then the entire subtree is
 *    collected so all org members are visible). Assign/revoke proxy endpoints,
 *    MCP servers, skills, and guardrail profiles.
 *  - Organizations: same, but the subject is an organization.
 *
 * DB backing: migration 013 junction tables (user_proxy_endpoints, user_mcp_servers,
 * user_skills, user_guardrails, and org_* equivalents).
 */

import { useState, useMemo, useCallback } from 'react';
import { PageHead, Tabs } from '@/components/ui';
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

/** Reads the parent org id stored in settings JSONB (same as org/page.tsx). */
function parentOf(o: Organization): string | null {
  return (o.settings as { parent_org_id?: string } | null)?.parent_org_id ?? null;
}

/**
 * Traverse UP the parent_org_id chain from startOrgId to find the root org
 * (the one with no parent, or whose parent is not in the org list).
 */
function findRootOrgId(orgs: Organization[], startOrgId: string): string {
  const byId = new Map(orgs.map(o => [o.id, o]));
  let current = startOrgId;
  const visited = new Set<string>();
  while (true) {
    if (visited.has(current)) break; // cycle guard
    visited.add(current);
    const org = byId.get(current);
    if (!org) break;
    const pid = parentOf(org);
    if (!pid || !byId.has(pid)) return current;
    current = pid;
  }
  return startOrgId;
}

/**
 * BFS down from rootId collecting all descendant org IDs (inclusive of root).
 */
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

/* ── TestingModal ────────────────────────────────────────────────────────────── */

/** Badge colours for each trace step status. */
const STATUS_COLOR: Record<string, string> = {
  pass: '#24a148',
  fail: '#da1e28',
  warn: '#f1c21b',
  skip: '#8d8d8d',
};

/** Icons for each trace step status (from the Icon set). */
const STATUS_ICON: Record<string, string> = {
  pass: 'checkmarkFill',
  fail: 'error',
  warn: 'warningAlt',
  skip: 'info',
};

/** Human-readable label for each step id. */
const STEP_LABEL: Record<string, string> = {
  resolve_user:     'Resolve user',
  endpoint_access:  'Endpoint access',
  mcp_access:       'MCP server access',
  skill_access:     'Skill access',
  guardrail_pii:    'PII guardrail',
  guardrail_budget: 'Budget guardrail',
  guardrail_rate:   'Rate limit',
};

/** A single expanded-details row in the trace. */
function DetailBlock({ details }: { details: Record<string, unknown> }) {
  return (
    <pre style={{
      margin: '6px 0 0',
      padding: '8px 10px',
      borderRadius: 2,
      background: 'var(--layer-02, #e8e8e8)',
      fontSize: 11,
      lineHeight: 1.55,
      color: 'var(--text-primary)',
      overflowX: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }}>
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}

/** One row in the trace list. Clicking the row toggles the details block. */
function TraceRow({ check }: { check: RouteTestCheck }) {
  const [open, setOpen] = useState(false);
  const color = STATUS_COLOR[check.status] ?? '#8d8d8d';
  const icon  = STATUS_ICON[check.status]  ?? 'info';
  const label = STEP_LABEL[check.step]     ?? check.step;

  return (
    <div style={{
      borderBottom: '1px solid var(--border-subtle)',
      padding: '8px 0',
      cursor: check.details ? 'pointer' : 'default',
    }} onClick={() => check.details && setOpen(v => !v)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Status dot */}
        <Icon name={icon} size={14} style={{ color, flexShrink: 0 }} />
        {/* Step label */}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140 }}>
          {label}
        </span>
        {/* Status badge */}
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px',
          borderRadius: 10, background: color + '22', color,
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {check.status}
        </span>
        {/* Message */}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>
          {check.message}
        </span>
        {/* Expand toggle */}
        {check.details && (
          <Icon
            name={open ? 'chevronUp' : 'chevronDown'}
            size={12}
            style={{ color: 'var(--text-secondary)', flexShrink: 0 }}
          />
        )}
      </div>
      {open && check.details && <DetailBlock details={check.details} />}
    </div>
  );
}

/**
 * TestingModal — two-pane modal for dry-run route testing.
 *
 * Left pane: request form (API key dropdown, message, MCP server, endpoint).
 * Right pane: trace — ordered CheckResult rows with expandable details.
 *
 * The API key dropdown is pre-populated from the database:
 *   userId set  → fetch api-keys for that specific user
 *   orgId set   → fetch api-keys belonging to any user in that organisation
 */
function TestingModal({
  onClose,
  allEps,
  allMcps,
  userId,
  orgId,
}: {
  onClose: () => void;
  allEps: ProxyEndpoint[];
  allMcps: McpServer[];
  /** When set, the key dropdown lists keys for this specific user. */
  userId?: string;
  /** When set, the key dropdown lists keys for users in this organisation. */
  orgId?: string;
}) {
  // Fetch API keys filtered to the user or org passed in by the parent pane.
  const keyFilter: Record<string, string> = userId
    ? { user_id: userId,  limit: '500' }
    : orgId
    ? { org_id:  orgId,   limit: '500' }
    : {};
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

  // Derive provider account from the selected endpoint
  const activeEps = allEps.filter(e => e.is_active);
  const selectedEp = activeEps.find(ep => ep.id === endpointId) ?? null;
  const providerAccountId = selectedEp?.provider_account_id ?? '';

  // Fetch models for the selected endpoint's provider account
  const modelFilter = providerAccountId ? { provider_id: providerAccountId, limit: '100' } : { limit: '1' };
  const { data: rawModels } = useResourceList<Model>('models', modelFilter);
  const availableModels = providerAccountId
    ? rawModels.filter(m => m.is_active)
    : [];

  function handleEndpointChange(id: string) {
    setEndpointId(id);
    setModelId(''); // reset model when endpoint changes
  }

  async function runTest() {
    if (!selectedKeyId) return;
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/route-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keyId:       selectedKeyId,
          message,
          mcpServerId: mcpId      || undefined,
          endpointId:  endpointId || undefined,
        }),
      });
      const json = (await res.json()) as RouteTestReport | { error?: string };
      if (!res.ok) {
        setError((json as { error?: string }).error ?? `Error ${res.status}`);
      } else {
        setReport(json as RouteTestReport);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  void modelId; // used in future live-execution path

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal shell */}
      <div style={{
        background: 'var(--layer-01, #f4f4f4)',
        borderRadius: 4,
        width: '100%', maxWidth: 900,
        maxHeight: '92vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--layer-02, white)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="play" size={16} style={{ color: 'var(--interactive-01, #0f62fe)' }} />
            <span style={{ fontSize: 15, fontWeight: 600 }}>Route Request Testing</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <Icon name="close" size={16} style={{ color: 'var(--text-secondary)' }} />
          </button>
        </div>

        {/* Body — two-pane */}
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', flex: 1, overflow: 'hidden' }}>

          {/* ── Left pane: inputs ── */}
          <div style={{
            borderRight: '1px solid var(--border-subtle)',
            padding: 20,
            overflowY: 'auto',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                API Key <span style={{ color: '#da1e28' }}>*</span>
              </label>
              <select
                value={selectedKeyId}
                onChange={e => setSelectedKeyId(e.target.value)}
                style={{
                  width: '100%', fontSize: 13, padding: '6px 8px',
                  border: '1px solid var(--border-strong)', borderRadius: 2,
                  background: 'var(--field-bg, white)', color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}
              >
                <option value="">— Select an API key —</option>
                {apiKeys.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.name || k.id.slice(0, 8)}{k.scope ? ` · ${k.scope}` : ''}
                  </option>
                ))}
              </select>
              {apiKeys.length === 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                  No active API keys found for this {userId ? 'user' : 'organization'}.
                </p>
              )}
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Message
              </label>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Enter the user's message (scanned for skill references and PII)…"
                rows={5}
                style={{
                  width: '100%', fontSize: 13, padding: '6px 8px',
                  border: '1px solid var(--border-strong)', borderRadius: 2,
                  background: 'var(--field-bg, white)', color: 'var(--text-primary)',
                  boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Proxy Endpoint
              </label>
              <select value={endpointId} onChange={e => handleEndpointChange(e.target.value)}
                style={{
                  width: '100%', fontSize: 13, padding: '6px 8px',
                  border: '1px solid var(--border-strong)', borderRadius: 2,
                  background: 'var(--field-bg, white)', color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}>
                <option value="">— None (skip check) —</option>
                {activeEps.map(ep => (
                  <option key={ep.id} value={ep.id}>{endpointLabel(ep)}</option>
                ))}
              </select>
            </div>

            {endpointId && availableModels.length > 0 && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Model
                </label>
                <select value={modelId} onChange={e => setModelId(e.target.value)}
                  style={{
                    width: '100%', fontSize: 13, padding: '6px 8px',
                    border: '1px solid var(--border-strong)', borderRadius: 2,
                    background: 'var(--field-bg, white)', color: 'var(--text-primary)',
                    boxSizing: 'border-box',
                  }}>
                  <option value="">— Default (from provider config) —</option>
                  {availableModels.map(m => (
                    <option key={m.id} value={m.model_id}>
                      {m.name || m.model_id}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                MCP Server
              </label>
              <select value={mcpId} onChange={e => setMcpId(e.target.value)}
                style={{
                  width: '100%', fontSize: 13, padding: '6px 8px',
                  border: '1px solid var(--border-strong)', borderRadius: 2,
                  background: 'var(--field-bg, white)', color: 'var(--text-primary)',
                  boxSizing: 'border-box',
                }}>
                <option value="">— None (skip check) —</option>
                {allMcps.filter(m => m.is_active).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <button
              onClick={runTest}
              disabled={loading || !selectedKeyId}
              style={{
                marginTop: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 16px', fontSize: 13, fontWeight: 600,
                background: loading || !selectedKeyId ? 'var(--interactive-03, #8d8d8d)' : 'var(--interactive-01, #0f62fe)',
                color: 'white', border: 'none', borderRadius: 2,
                cursor: loading || !selectedKeyId ? 'not-allowed' : 'pointer',
              }}
            >
              <Icon name={loading ? 'refresh' : 'play'} size={13} />
              {loading ? 'Running…' : 'Run Test'}
            </button>
          </div>

          {/* ── Right pane: trace ── */}
          <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!report && !error && !loading && (
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 10,
                color: 'var(--text-placeholder)',
              }}>
                <Icon name="route" size={40} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: 13 }}>Fill in the form and click Run Test to see the trace</span>
              </div>
            )}

            {loading && (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-secondary)', gap: 8, fontSize: 13,
              }}>
                <Icon name="refresh" size={16} style={{ color: 'var(--interactive-01, #0f62fe)' }} />
                Running validation pipeline…
              </div>
            )}

            {error && (
              <div style={{
                padding: '12px 14px', borderRadius: 2,
                background: '#fff1f1', border: '1px solid #da1e28',
                color: '#da1e28', fontSize: 13,
              }}>
                <Icon name="error" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                {error}
              </div>
            )}

            {report && !loading && (
              <>
                {/* Summary banner */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', borderRadius: 2, marginBottom: 16,
                  background: report.allowed ? '#defbe6' : '#fff1f1',
                  border: `1px solid ${report.allowed ? '#24a148' : '#da1e28'}`,
                }}>
                  <Icon
                    name={report.allowed ? 'checkmarkFill' : 'error'}
                    size={16}
                    style={{ color: report.allowed ? '#24a148' : '#da1e28', flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: report.allowed ? '#24a148' : '#da1e28' }}>
                      {report.allowed ? 'Request would be allowed' : 'Request would be blocked'}
                    </div>
                    {(report.user_id || report.org_id) && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {report.user_id && (
                          <>{report.user_name || report.user_id}</>
                        )}
                        {report.user_id && report.org_id && <span style={{ margin: '0 6px', opacity: 0.4 }}>·</span>}
                        {report.org_id && (
                          <>{report.org_name || report.org_id}</>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Trace steps */}
                <div style={{ fontSize: 13 }}>
                  {report.checks.map((check, i) => (
                    <TraceRow key={i} check={check} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── ServiceSection ──────────────────────────────────────────────────────────── */

interface Link { id: string; targetId: string; }

function ServiceSection<TLink extends Link, TItem extends { id: string }>({
  title, icon, links, allItems, getItemId, getItemLabel, onAdd, onRemove,
}: {
  title: string;
  icon: string;
  links: TLink[];
  allItems: TItem[];
  getItemId: (item: TItem) => string;
  getItemLabel: (item: TItem) => string;
  onAdd: (itemId: string) => Promise<void>;
  onRemove: (linkId: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const assignedIds = new Set(links.map(l => l.targetId));
  const unassigned  = allItems.filter(item => !assignedIds.has(getItemId(item)));

  async function handleAdd(itemId: string) {
    if (!itemId) return;
    setAdding(true);
    try { await onAdd(itemId); } finally { setAdding(false); }
  }

  async function handleRemove(linkId: string) {
    setRemoving(linkId);
    try { await onRemove(linkId); } finally { setRemoving(null); }
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name={icon} size={13} style={{ color: 'var(--text-secondary)' }} />
          <span style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--text-secondary)',
          }}>
            {title}
          </span>
          {links.length > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 600,
              background: 'var(--tag-background, #e0e0e0)',
              color: 'var(--text-secondary)',
              borderRadius: 10, padding: '1px 6px',
            }}>
              {links.length}
            </span>
          )}
        </div>

        {unassigned.length > 0 && (
          <select
            value=""
            disabled={adding}
            onChange={e => handleAdd(e.target.value)}
            style={{
              fontSize: 12, padding: '3px 8px',
              border: '1px solid var(--border-strong)',
              borderRadius: 2, background: 'var(--field-bg, #f4f4f4)',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            <option value="">{adding ? 'Adding…' : '+ Add'}</option>
            {unassigned.map(item => (
              <option key={getItemId(item)} value={getItemId(item)}>
                {getItemLabel(item)}
              </option>
            ))}
          </select>
        )}
      </div>

      {links.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-placeholder)', fontStyle: 'italic', paddingLeft: 2 }}>
          None assigned
        </div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {links.map(link => {
            const item = allItems.find(i => getItemId(i) === link.targetId);
            const label = item ? getItemLabel(item) : link.targetId.slice(0, 8) + '…';
            return (
              <span key={link.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, padding: '3px 10px',
                background: 'var(--layer-accent, #e8f4fd)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 12, color: 'var(--text-primary)',
              }}>
                {label}
                <button
                  onClick={() => handleRemove(link.id)}
                  disabled={removing === link.id}
                  title="Remove"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, lineHeight: 1, color: 'var(--text-secondary)',
                    display: 'flex', alignItems: 'center',
                    opacity: removing === link.id ? 0.4 : 1,
                  }}
                >
                  <Icon name="close" size={10} />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── UserDetailPane (only mounts when a user is selected) ───────────────────── */

function UserDetailPane({
  user, orgId,
  allEps, activeMcps, activeSk, activeGrd,
}: {
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

  return (
    <>
      <ProxyServicesGraph
        open={graphOpen}
        onClose={() => setGraphOpen(false)}
        subject={user}
        subjectType="user"
        epLinks={userEps}
        mcpLinks={userMcps}
        skillLinks={userSkills}
        grdLinks={userGrds}
        allEps={allEps}
        allMcps={activeMcps}
        allSk={activeSk}
        allGrd={activeGrd}
      />

      {testingOpen && (
        <TestingModal
          onClose={() => setTestingOpen(false)}
          allEps={allEps}
          allMcps={activeMcps}
          userId={user.id}
        />
      )}

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{user.name || user.email}</div>
          {user.name && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{user.email}</div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setTestingOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '5px 12px', marginTop: 2,
              background: 'var(--interactive-secondary, #393939)',
              color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer',
            }}
          >
            <Icon name="play" size={13} style={{ opacity: 0.9 }} />
            Testing
          </button>
          <button
            onClick={() => setGraphOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '5px 12px', marginTop: 2,
              background: 'var(--interactive-01, #0f62fe)',
              color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer',
            }}
          >
            <Icon name="route" size={13} style={{ opacity: 0.9 }} />
            View Graph
          </button>
        </div>
      </div>

      <ServiceSection title="Proxy Endpoints" icon="globe"
        links={epLinks} allItems={activeEps}
        getItemId={ep => ep.id} getItemLabel={endpointLabel}
        onAdd={addEp} onRemove={rmEp} />

      <ServiceSection title="MCP Servers" icon="server"
        links={mcpLinks} allItems={activeMcps}
        getItemId={m => m.id} getItemLabel={m => m.name}
        onAdd={addMcp} onRemove={rmMcp} />

      <ServiceSection title="Skills" icon="idea"
        links={skLinks} allItems={activeSk}
        getItemId={s => s.id} getItemLabel={s => `${s.name}${s.version ? ` v${s.version}` : ''}`}
        onAdd={addSk} onRemove={rmSk} />

      <ServiceSection title="Guardrails" icon="shield"
        links={grdLinks} allItems={activeGrd}
        getItemId={g => g.id} getItemLabel={g => g.name}
        onAdd={addGrd} onRemove={rmGrd} />
    </>
  );
}

/* ── OrgDetailPane (only mounts when an org is selected) ────────────────────── */

function OrgDetailPane({
  org,
  allEps, activeMcps, activeSk, activeGrd,
}: {
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

  return (
    <>
      <ProxyServicesGraph
        open={graphOpen}
        onClose={() => setGraphOpen(false)}
        subject={org}
        subjectType="org"
        epLinks={orgEps}
        mcpLinks={orgMcps}
        skillLinks={orgSkills}
        grdLinks={orgGrds}
        allEps={allEps}
        allMcps={activeMcps}
        allSk={activeSk}
        allGrd={activeGrd}
      />

      {testingOpen && (
        <TestingModal
          onClose={() => setTestingOpen(false)}
          allEps={allEps}
          allMcps={activeMcps}
          orgId={org.id}
        />
      )}

      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{org.name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{org.slug}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => setTestingOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '5px 12px', marginTop: 2,
              background: 'var(--interactive-secondary, #393939)',
              color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer',
            }}
          >
            <Icon name="play" size={13} style={{ opacity: 0.9 }} />
            Testing
          </button>
          <button
            onClick={() => setGraphOpen(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 12, padding: '5px 12px', marginTop: 2,
              background: 'var(--interactive-01, #0f62fe)',
              color: 'white', border: 'none', borderRadius: 2, cursor: 'pointer',
            }}
          >
            <Icon name="route" size={13} style={{ opacity: 0.9 }} />
            View Graph
          </button>
        </div>
      </div>

      <ServiceSection title="Proxy Endpoints" icon="globe"
        links={epLinks} allItems={activeEps}
        getItemId={ep => ep.id} getItemLabel={endpointLabel}
        onAdd={addEp} onRemove={rmEp} />

      <ServiceSection title="MCP Servers" icon="server"
        links={mcpLinks} allItems={activeMcps}
        getItemId={m => m.id} getItemLabel={m => m.name}
        onAdd={addMcp} onRemove={rmMcp} />

      <ServiceSection title="Skills" icon="idea"
        links={skLinks} allItems={activeSk}
        getItemId={s => s.id} getItemLabel={s => `${s.name}${s.version ? ` v${s.version}` : ''}`}
        onAdd={addSk} onRemove={rmSk} />

      <ServiceSection title="Guardrails" icon="shield"
        links={grdLinks} allItems={activeGrd}
        getItemId={g => g.id} getItemLabel={g => g.name}
        onAdd={addGrd} onRemove={rmGrd} />
    </>
  );
}

/* ── shared two-pane wrapper ─────────────────────────────────────────────────── */

const PANE_STYLE = {
  display: 'grid', gridTemplateColumns: '280px 1fr', gap: 0,
  border: '1px solid var(--border-subtle)', borderRadius: 4, overflow: 'hidden',
  minHeight: 480,
} as const;

const RIGHT_STYLE = {
  padding: 20, overflowY: 'auto' as const,
  background: 'var(--layer-01, #f4f4f4)',
};

/* ── UserServicesPane ────────────────────────────────────────────────────────── */

function UserServicesPane({ orgId }: { orgId: string | undefined }) {
  const [search, setSearch] = useState('');
  const [selId, setSelId]   = useState<string | null>(null);

  const { user: sessionUser } = useSession();
  const sessionOrgId = sessionUser?.orgId ?? orgId;

  // Fetch all orgs to build the hierarchy tree
  const { data: allOrgs } = useResourceList<Organization>('organizations', { limit: 500 });

  // Walk UP to root, then BFS DOWN to collect all org IDs in the subtree
  const rootOrgId = useMemo(
    () => sessionOrgId && allOrgs.length ? findRootOrgId(allOrgs, sessionOrgId) : sessionOrgId,
    [allOrgs, sessionOrgId],
  );
  const orgSubtreeIds = useMemo(
    () => rootOrgId && allOrgs.length ? collectSubtreeIds(allOrgs, rootOrgId) : new Set<string>(),
    [allOrgs, rootOrgId],
  );

  // Fetch ALL users, then filter to those in the root org subtree
  const { data: rawUsers } = useResourceList<User>('users', { limit: 500 });
  const users = useMemo(() => rawUsers.filter(u =>
    u.is_active &&
    (orgSubtreeIds.size === 0 || orgSubtreeIds.has(u.org_id)) &&
    (!search || u.name?.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()))
  ), [rawUsers, orgSubtreeIds, search]);

  const sel = users.find(u => u.id === selId) ?? null;

  const { data: allEps  } = useResourceList<ProxyEndpoint>   ('proxy-endpoints',    { limit: 500 });
  const { data: allMcps } = useResourceList<McpServer>        ('mcp-servers',        { org_id: orgId, limit: 500 });
  const { data: allSk   } = useResourceList<Skill>            ('skills',             { org_id: orgId, limit: 500 });
  const { data: allGrd  } = useResourceList<GuardrailProfile> ('guardrail-profiles', { org_id: orgId, limit: 500 });

  const activeMcps = useMemo(() => allMcps.filter(m => m.is_active),            [allMcps]);
  const activeSk   = useMemo(() => allSk.filter(s => s.status !== 'deprecated'), [allSk]);
  const activeGrd  = useMemo(() => allGrd.filter(g => g.is_active),              [allGrd]);

  return (
    <div style={PANE_STYLE}>
      {/* Left pane */}
      <div style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input type="search" placeholder="Search users…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', fontSize: 13, padding: '5px 8px',
              border: '1px solid var(--border-strong)', borderRadius: 2,
              background: 'var(--field-bg, #f4f4f4)', color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {users.length === 0
            ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-placeholder)', textAlign: 'center' }}>No users found</div>
            : users.map(u => {
              const uOrg = allOrgs.find(o => o.id === u.org_id);
              return (
                <div key={u.id}
                  className={`md-item${selId === u.id ? ' sel' : ''}`}
                  onClick={() => setSelId(u.id === selId ? null : u.id)}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name || u.email}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                    {u.name ? u.email : uOrg?.name ?? ''}
                    {u.name && uOrg ? ` · ${uOrg.name}` : ''}
                  </div>
                </div>
              );
            })
          }
        </div>
      </div>

      {/* Right pane */}
      <div style={RIGHT_STYLE}>
        {sel ? (
          <UserDetailPane key={sel.id}
            user={sel} orgId={orgId}
            allEps={allEps} activeMcps={activeMcps} activeSk={activeSk} activeGrd={activeGrd} />
        ) : (
          <EmptySelection icon="users" message="Select a user to manage their proxy service access" />
        )}
      </div>
    </div>
  );
}

/* ── OrgServicesPane ─────────────────────────────────────────────────────────── */

function OrgServicesPane() {
  const [search, setSearch] = useState('');
  const [selId, setSelId]   = useState<string | null>(null);

  const { user: sessionUser } = useSession();

  const { data: rawOrgs } = useResourceList<Organization>('organizations', { limit: 500 });

  // Walk UP to root from the session user's org, then BFS DOWN to get the subtree
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
    (!search || o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase()))
  ), [rawOrgs, orgSubtreeIds, search]);

  const sel = orgs.find(o => o.id === selId) ?? null;

  const { data: allEps  } = useResourceList<ProxyEndpoint>   ('proxy-endpoints',    { limit: 500 });
  const { data: allMcps } = useResourceList<McpServer>        ('mcp-servers',        { org_id: selId ?? undefined, limit: 500 });
  const { data: allSk   } = useResourceList<Skill>            ('skills',             { org_id: selId ?? undefined, limit: 500 });
  const { data: allGrd  } = useResourceList<GuardrailProfile> ('guardrail-profiles', { org_id: selId ?? undefined, limit: 500 });

  const activeMcps = useMemo(() => allMcps.filter(m => m.is_active),            [allMcps]);
  const activeSk   = useMemo(() => allSk.filter(s => s.status !== 'deprecated'), [allSk]);
  const activeGrd  = useMemo(() => allGrd.filter(g => g.is_active),              [allGrd]);

  return (
    <div style={PANE_STYLE}>
      {/* Left pane */}
      <div style={{ borderRight: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input type="search" placeholder="Search organizations…" value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%', fontSize: 13, padding: '5px 8px',
              border: '1px solid var(--border-strong)', borderRadius: 2,
              background: 'var(--field-bg, #f4f4f4)', color: 'var(--text-primary)',
              boxSizing: 'border-box',
            }} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {orgs.length === 0
            ? <div style={{ padding: 16, fontSize: 13, color: 'var(--text-placeholder)', textAlign: 'center' }}>No organizations found</div>
            : orgs.map(o => (
              <div key={o.id}
                className={`md-item${selId === o.id ? ' sel' : ''}`}
                onClick={() => setSelId(o.id === selId ? null : o.id)}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{o.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>{o.slug}</div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Right pane */}
      <div style={RIGHT_STYLE}>
        {sel ? (
          <OrgDetailPane key={sel.id}
            org={sel}
            allEps={allEps} activeMcps={activeMcps} activeSk={activeSk} activeGrd={activeGrd} />
        ) : (
          <EmptySelection icon="flow" message="Select an organization to manage its proxy service access" />
        )}
      </div>
    </div>
  );
}

/* ── EmptySelection ──────────────────────────────────────────────────────────── */

function EmptySelection({ icon, message }: { icon: string; message: string }) {
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 10,
      color: 'var(--text-placeholder)',
    }}>
      <Icon name={icon} size={36} style={{ opacity: 0.25 }} />
      <span style={{ fontSize: 13 }}>{message}</span>
    </div>
  );
}

/* ── Main page ───────────────────────────────────────────────────────────────── */

export default function ProxyServicesPage() {
  const orgId = useDefaultOrgId();
  const [tab, setTab] = useState('users');

  return (
    <div>
      <PageHead
        title="Proxy Services"
        sub="Map users and organizations to eligible proxy endpoints, MCP servers, skills, and guardrail profiles."
      />

      <div style={{ marginTop: 20 }}>
        <Tabs active={tab} onChange={setTab} tabs={PAGE_TABS} />
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === 'users'
          ? <UserServicesPane orgId={orgId} />
          : <OrgServicesPane />
        }
      </div>
    </div>
  );
}
