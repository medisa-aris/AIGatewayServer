'use client';

/**
 * Policies → Guardrails. CRUD over `guardrail-profiles` with:
 *  - entity_type   : organization | individual (what the profile is assigned to)
 *  - entity_id     : UUID of target org (org picker) or user (user search)
 *  - budget_id     : FK → one budget (dropdown)
 *  - rate_limit_id : FK → one rate-limit rule (dropdown)
 *
 * Org picker enforces one-profile-per-org: orgs already assigned are excluded.
 * User search is a live-filter combobox.
 *
 * Expand row → PII Objects panel: many-to-many via
 * `guardrail-profile-pii-objects` junction table.
 */

import { useState, useRef, useEffect } from 'react';
import { ResourceCrud } from '@/components/common/ResourceCrud';
import { Tag, Btn, Notif, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { createResource, deleteResource, ApiError } from '@/lib/api/resources';
import type {
  GuardrailProfile,
  PiiObject,
  Budget,
  RateLimit,
  GuardrailProfilePiiObject,
  Organization,
  User,
} from '@/lib/types';

const HOOKS = [
  { id: 'llm_input',  label: 'LLM Input',        icon: 'arrowRight' },
  { id: 'llm_output', label: 'LLM Output',        icon: 'arrowRight' },
  { id: 'mcp_pre',    label: 'MCP Pre-invoke',    icon: 'server' },
  { id: 'mcp_post',   label: 'MCP Post-invoke',   icon: 'server' },
];

/* -------------------------------------------------------------------------- */
/* OrgPicker                                                                   */
/* -------------------------------------------------------------------------- */

interface OrgPickerProps {
  orgs: Organization[];
  /** IDs of orgs already assigned to another profile (excluded from the list). */
  takenIds: Set<string>;
  /** Current entity_id value (excluded from takenIds check so edit works). */
  currentId: string;
  value: string;
  onChange: (v: string) => void;
}

function buildOrgTree(orgs: Organization[]): { id: string; name: string; depth: number }[] {
  const parentMap = new Map<string, string>();
  for (const org of orgs) {
    const parentId = (org.settings as Record<string, unknown> | null)?.parent_org_id as string | undefined;
    if (parentId) parentMap.set(org.id, parentId);
  }

  const childrenOf = new Map<string | null, Organization[]>();
  for (const org of orgs) {
    const parent = parentMap.get(org.id) ?? null;
    if (!childrenOf.has(parent)) childrenOf.set(parent, []);
    childrenOf.get(parent)!.push(org);
  }

  const result: { id: string; name: string; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const org of childrenOf.get(parentId) ?? []) {
      result.push({ id: org.id, name: org.name, depth });
      walk(org.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

function OrgPicker({ orgs, takenIds, currentId, value, onChange }: OrgPickerProps) {
  const tree = buildOrgTree(orgs);
  const available = tree.filter((o) => !takenIds.has(o.id) || o.id === currentId);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        height: 40,
        padding: '0 12px',
        background: 'var(--field-01, var(--layer-01))',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-primary)',
        fontSize: 14,
        borderRadius: 0,
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'%3E%3Cpath fill='%23${encodeURIComponent('8d8d8d')}' d='M8 11L3 6h10z'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        paddingRight: 36,
        cursor: 'pointer',
      }}
    >
      <option value="">— select organization —</option>
      {available.map((o) => (
        <option key={o.id} value={o.id}>
          {'  '.repeat(o.depth)}{o.name}
        </option>
      ))}
    </select>
  );
}

/* -------------------------------------------------------------------------- */
/* UserSearch                                                                  */
/* -------------------------------------------------------------------------- */

interface UserSearchProps {
  /** Organisation scope — passed as org_id to the search API. */
  orgId: string;
  value: string;
  onChange: (v: string) => void;
}

/**
 * Live-search combobox that queries GET /api/v1/users/search?q=…&org_id=…
 * on every keystroke (debounced 300 ms). When an existing value (UUID) is
 * supplied — e.g. opening an edit modal — the component fetches the user
 * record once to populate the display label.
 */
function UserSearch({ orgId, value, onChange }: UserSearchProps) {
  const [inputText, setInputText] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Resolve display label when an existing value arrives (edit mode).
  useEffect(() => {
    if (!value) { setInputText(''); return; }
    const cached = results.find((u) => u.id === value);
    if (cached) { setInputText(`${cached.name} (${cached.email})`); return; }
    fetch(`/api/v1/users/${encodeURIComponent(value)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data: User } | null) => {
        if (j?.data) setInputText(`${j.data.name} (${j.data.email})`);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function doSearch(q: string) {
    if (!q.trim() || !orgId) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const qs = new URLSearchParams({ q, org_id: orgId, limit: '20' });
    fetch(`/api/v1/users/search?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((j: { data: User[] }) => { setResults(j.data ?? []); setOpen(true); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  function handleInputChange(v: string) {
    setInputText(v);
    if (!v) onChange('');
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(v), 300);
  }

  function pick(u: User) {
    onChange(u.id);
    setInputText(`${u.name} (${u.email})`);
    setResults([]);
    setOpen(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    height: 40,
    padding: '0 12px',
    background: 'var(--field-01, var(--layer-01))',
    border: '1px solid var(--border-strong)',
    color: 'var(--text-primary)',
    fontSize: 14,
    borderRadius: 0,
    boxSizing: 'border-box',
  };

  const dropStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 9999,
    background: 'var(--layer-02)',
    border: '1px solid var(--border-strong)',
    maxHeight: 220,
    overflowY: 'auto',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        type="text"
        value={inputText}
        onChange={(e) => handleInputChange(e.target.value)}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        placeholder="Search by name or email…"
        style={inputStyle}
      />
      {open && loading && (
        <div style={dropStyle}>
          <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-helper)' }}>Searching…</div>
        </div>
      )}
      {open && !loading && results.length > 0 && (
        <div style={dropStyle}>
          {results.map((u) => (
            <div
              key={u.id}
              onMouseDown={() => pick(u)}
              style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = 'var(--layer-03, var(--layer-01))')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = '')}
            >
              <span style={{ fontWeight: 500 }}>{u.name}</span>
              <span style={{ color: 'var(--text-helper)', marginLeft: 8 }}>{u.email}</span>
            </div>
          ))}
        </div>
      )}
      {open && !loading && results.length === 0 && inputText.trim() && (
        <div style={dropStyle}>
          <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-helper)' }}>No users found.</div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PiiMappingPanel                                                             */
/* -------------------------------------------------------------------------- */

function PiiMappingPanel({ profile }: { profile: GuardrailProfile }) {
  const { data: allPii } = useResourceList<PiiObject>('pii-objects', { limit: 500 });
  const { data: links, mutate: mutateLinks } = useResourceList<GuardrailProfilePiiObject>(
    'guardrail-profile-pii-objects',
    { limit: 500, guardrail_profile_id: profile.id },
  );

  const linkedIds = new Set(links.map((l) => l.pii_object_id));
  const unlinked = allPii.filter((p) => !linkedIds.has(p.id));

  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const filtered = query.trim()
    ? unlinked.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.detection_method.toLowerCase().includes(query.toLowerCase()))
    : unlinked;

  async function attach(piiObjectId: string) {
    setBusy(piiObjectId);
    setErr(null);
    try {
      await createResource('guardrail-profile-pii-objects', {
        guardrail_profile_id: profile.id,
        pii_object_id: piiObjectId,
      });
      mutateLinks();
      setQuery('');
      setDropOpen(false);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  async function detach(linkId: string) {
    setBusy(linkId);
    setErr(null);
    try {
      await deleteResource('guardrail-profile-pii-objects', linkId);
      mutateLinks();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  }

  const METHOD_COLOR: Record<string, 'blue' | 'purple' | 'green' | 'warm'> = {
    regex: 'blue', ner: 'purple', llm: 'green', dict: 'warm',
  };

  return (
    <div style={{ padding: '16px 24px', background: 'var(--layer-02)', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="shield" size={16} />
        PII Protection rules
        <Tag color="gray" sm>{links.length}</Tag>
      </div>

      {err && (
        <div style={{ marginBottom: 10 }}>
          <Notif kind="error" title="Error" onClose={() => setErr(null)}>{err}</Notif>
        </div>
      )}

      {/* Searchable dropdown to add PII rules */}
      {allPii.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>
          No PII objects configured for this org. Create some under <strong>Policies → PII Protection</strong>.
        </div>
      ) : unlinked.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>All available PII rules are attached.</div>
      ) : (
        <div ref={dropRef} style={{ position: 'relative', maxWidth: 360 }}>
          <div style={{ fontSize: 12, color: 'var(--text-helper)', marginBottom: 6 }}>Add PII rule:</div>
          <input
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setDropOpen(true); }}
            onFocus={() => setDropOpen(true)}
            placeholder="Search by name or method…"
            style={{
              width: '100%',
              height: 36,
              padding: '0 12px',
              background: 'var(--field-01, var(--layer-01))',
              border: '1px solid var(--border-strong)',
              color: 'var(--text-primary)',
              fontSize: 13,
              borderRadius: 0,
              boxSizing: 'border-box',
            }}
          />
          {dropOpen && filtered.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 9999,
                background: 'var(--layer-02)',
                border: '1px solid var(--border-strong)',
                borderTop: 'none',
                maxHeight: 200,
                overflowY: 'auto',
              }}
            >
              {filtered.map((p) => (
                <div
                  key={p.id}
                  onMouseDown={() => attach(p.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    cursor: busy === p.id ? 'wait' : 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 13,
                    opacity: busy === p.id ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--layer-03, var(--layer-01))'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = ''; }}
                >
                  <Icon name="shield" size={13} />
                  <span style={{ flex: 1 }}>{p.name}</span>
                  <Tag color={METHOD_COLOR[p.detection_method] ?? 'gray'} sm>{p.detection_method}</Tag>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Attached PII objects as removable pills */}
      {links.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
          {links.map((link) => {
            const pii = allPii.find((p) => p.id === link.pii_object_id);
            return (
              <div
                key={link.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '4px 10px',
                  border: '1px solid var(--border-strong, var(--border-subtle))',
                  borderRadius: 20,
                  background: 'var(--layer-01)',
                  fontSize: 13,
                  opacity: busy === link.id ? 0.5 : 1,
                }}
              >
                <Icon name="shield" size={13} />
                <span>{pii?.name ?? link.pii_object_id}</span>
                {pii && <Tag color={METHOD_COLOR[pii.detection_method] ?? 'gray'} sm>{pii.detection_method}</Tag>}
                <button
                  type="button"
                  onClick={() => detach(link.id)}
                  disabled={busy === link.id}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-helper)', padding: '0 2px', lineHeight: 1, fontSize: 16 }}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                        */
/* -------------------------------------------------------------------------- */

export default function GuardrailsPage() {
  const { user } = useSession();
  const orgId = user?.orgId;

  const { data: budgets } = useResourceList<Budget>('budgets', { limit: 500, org_id: orgId });
  const { data: rateLimits } = useResourceList<RateLimit>('rate-limits', { limit: 500, org_id: orgId });
  const { data: orgs } = useResourceList<Organization>('organizations', { limit: 500 });
  const { data: users } = useResourceList<User>('users', { limit: 500, org_id: orgId });
  const { data: profiles } = useResourceList<GuardrailProfile>('guardrail-profiles', { limit: 500, org_id: orgId });

  const budgetOptions = [
    { value: '', label: '— none —' },
    ...budgets.map((b) => ({ value: b.id, label: `${b.name} (${b.currency} ${b.period})` })),
  ];

  const rateLimitOptions = [
    { value: '', label: '— none —' },
    ...rateLimits.map((r) => ({ value: r.id, label: `${r.name} · ${r.limit_type} ${r.limit_value}/${r.window_seconds}s` })),
  ];

  /** IDs of orgs that already have a profile assigned (entity_type=organization). */
  const orgTakenIds = new Set(
    profiles
      .filter((p) => p.entity_type === 'organization' && p.entity_id)
      .map((p) => p.entity_id as string),
  );

  const columns: Column<GuardrailProfile & Record<string, unknown>>[] = [
    {
      key: 'name',
      label: 'Profile',
      render: (r) => <span className="cell-strong">{r.name}</span>,
    },
    {
      key: 'entity_type',
      label: 'Assigned to',
      render: (r) => {
        if (!r.entity_type) return <span className="muted">—</span>;
        const color = r.entity_type === 'organization' ? 'blue' : 'purple';
        return <Tag color={color} sm>{r.entity_type}</Tag>;
      },
    },
    {
      key: 'entity_id',
      label: 'Entity',
      render: (r) => {
        if (!r.entity_id) return <span className="muted">—</span>;
        if (r.entity_type === 'organization') {
          const org = orgs.find((o) => o.id === r.entity_id);
          return org ? <span style={{ fontSize: 13 }}>{org.name}</span> : <span className="muted" style={{ fontSize: 12 }}>{String(r.entity_id).slice(0, 8)}…</span>;
        }
        if (r.entity_type === 'individual') {
          const user = users.find((u) => u.id === r.entity_id);
          return user
            ? <span style={{ fontSize: 13 }}>{user.name}</span>
            : <span className="muted" style={{ fontSize: 12 }}>{String(r.entity_id).slice(0, 8)}…</span>;
        }
        return <span className="muted" style={{ fontSize: 12 }}>{String(r.entity_id).slice(0, 8)}…</span>;
      },
    },
    {
      key: 'budget_id',
      label: 'Budget',
      render: (r) => {
        const b = budgets.find((x) => x.id === r.budget_id);
        return b ? <Tag color="blue" sm>{b.name}</Tag> : <span className="muted">—</span>;
      },
    },
    {
      key: 'rate_limit_id',
      label: 'Rate limit',
      render: (r) => {
        const rl = rateLimits.find((x) => x.id === r.rate_limit_id);
        return rl ? <Tag color="purple" sm>{rl.name}</Tag> : <span className="muted">—</span>;
      },
    },
    {
      key: 'is_default',
      label: 'Default',
      render: (r) => (r.is_default ? <Tag color="purple" sm>default</Tag> : <span className="muted">—</span>),
    },
    {
      key: 'is_active',
      label: 'Active',
      render: (r) => (r.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>off</Tag>),
    },
  ];

  return (
    <div>
      {/* Enforcement hooks strip */}
      <Section title="Enforcement hooks" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {HOOKS.map((h) => (
            <div
              key={h.id}
              className="tile"
              style={{ flex: '1 1 180px', display: 'flex', alignItems: 'center', gap: 10, borderLeft: '3px solid var(--brand)' }}
            >
              <span style={{ color: 'var(--brand)' }}><Icon name={h.icon} size={18} /></span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{h.label}</div>
                <div style={{ fontSize: 11, color: 'var(--text-helper)' }}>guardrail hook</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <ResourceCrud<GuardrailProfile>
        resource="guardrail-profiles"
        title="Guardrail Profiles"
        sub="Content-safety policies (PII, injection, moderation, secrets) attached to one or more hooks."
        addLabel="Add guardrail"
        getKey={(r) => r.id}
        searchKeys={['name']}
        createDefaults={orgId ? { org_id: orgId } : {}}
        columns={columns}
        renderExpand={(r) => <PiiMappingPanel profile={r} />}
        fields={[
          { key: 'name', label: 'Name', placeholder: 'PII Redaction' },
          { key: 'description', label: 'Description', type: 'textarea', nullable: true },
          {
            key: 'entity_type',
            label: 'Assign to',
            type: 'select',
            nullable: true,
            options: [
              { value: '', label: '— select entity type —' },
              { value: 'organization', label: 'Organization' },
              { value: 'individual', label: 'Individual' },
            ],
            help: 'Whether this profile is applied org-wide or to a specific user',
          },
          {
            key: 'entity_id',
            label: (form) => form.entity_type === 'individual' ? 'User' : 'Entity',
            nullable: true,
            help: 'Select the organization or user this profile applies to',
            renderField: (value, onChange, form) => {
              if (form.entity_type === 'organization') {
                return (
                  <OrgPicker
                    orgs={orgs}
                    takenIds={orgTakenIds}
                    currentId={value}
                    value={value}
                    onChange={onChange}
                  />
                );
              }
              if (form.entity_type === 'individual') {
                return (
                  <UserSearch
                    orgId={orgId ?? ''}
                    value={value}
                    onChange={onChange}
                  />
                );
              }
              return (
                <div style={{ fontSize: 13, color: 'var(--text-helper)', padding: '10px 0' }}>
                  Select an assignment type first.
                </div>
              );
            },
          },
          {
            key: 'budget_id',
            label: 'Budget',
            type: 'select',
            options: budgetOptions,
            nullable: true,
            help: 'Attach one budget constraint to this profile',
          },
          {
            key: 'rate_limit_id',
            label: 'Rate limit',
            type: 'select',
            options: rateLimitOptions,
            nullable: true,
            help: 'Attach one rate-limit rule to this profile',
          },
          { key: 'is_default', label: 'Default profile', type: 'toggle', default: 'false' },
          { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
        ]}
      />
    </div>
  );
}
