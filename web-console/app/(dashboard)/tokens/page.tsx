'use client';

/**
 * Administration → API Tokens. CRUD over `api-keys`.
 * Create generates a random raw key client-side, stores only its SHA-256 hash,
 * and reveals the raw key once. Revoke = PATCH is_active:false.
 *
 * Scope: only tokens whose org_id is in the root-org subtree of the logged-in user
 * are shown (vertical org scope).
 */

import { useMemo, useState } from 'react';
import { PageHead, Btn, Tag, Modal, Field, Input, Select, Notif, DataTable, Toggle, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { useSession } from '@/lib/session';
import { createResource, updateResource, ApiError } from '@/lib/api/resources';
import type { ApiKey, Organization, User } from '@/lib/types';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pk-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  const d = new Date(val);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Walk org tree upward to find the root org id (no parent_org_id in settings). */
function findRootOrgId(startOrgId: string, orgs: Organization[]): string {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  let current = byId.get(startOrgId);
  const visited = new Set<string>();
  while (current) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parentId = (current.settings as Record<string, unknown> | null)?.parent_org_id as string | undefined;
    if (!parentId) break;
    const parent = byId.get(parentId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? startOrgId;
}

/** Collect all org ids in the subtree rooted at rootId (BFS). */
function collectOrgSubtree(rootId: string, orgs: Organization[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const o of orgs) {
    const parentId = (o.settings as Record<string, unknown> | null)?.parent_org_id as string | undefined;
    if (parentId) {
      const arr = childrenOf.get(parentId) ?? [];
      arr.push(o.id);
      childrenOf.set(parentId, arr);
    }
  }
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    for (const child of childrenOf.get(id) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }
  return result;
}

export default function TokensPage() {
  const { user: sessionUser } = useSession();
  const orgId = useDefaultOrgId();
  const { data: keys, isLoading, mutate } = useResourceList<ApiKey>('api-keys', { limit: 500 });
  const { data: users } = useResourceList<User>('users', { limit: 500 });
  const { data: orgs } = useResourceList<Organization>('organizations', { limit: 500 });

  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('full');
  const [userId, setUserId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);
  const [revokeErr, setRevokeErr] = useState<string | null>(null);
  const [activeOnly, setActiveOnly] = useState(true);

  // Edit expiry modal state
  const [editTarget, setEditTarget] = useState<ApiKey | null>(null);
  const [editExpiresAt, setEditExpiresAt] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState<string | null>(null);

  // Build the set of org ids the logged-in user is allowed to see (their root org subtree).
  const allowedOrgIds = useMemo<Set<string>>(() => {
    if (!sessionUser || orgs.length === 0) return new Set<string>();
    const rootId = findRootOrgId(sessionUser.orgId, orgs);
    return collectOrgSubtree(rootId, orgs);
  }, [sessionUser, orgs]);

  // Map user_id → user name for the grid.
  const userMap = useMemo(() => new Map(users.map((u) => [u.id, u.name])), [users]);

  // Users scoped to allowed orgs (for the owner dropdown when creating).
  const allowedUsers = useMemo(
    () => (allowedOrgIds.size === 0 ? users : users.filter((u) => allowedOrgIds.has(u.org_id))),
    [users, allowedOrgIds],
  );

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const raw = randomKey();
      const key_hash = await sha256Hex(raw);
      const uid = userId || allowedUsers[0]?.id || users[0]?.id;
      const payload: Record<string, unknown> = { name, scope, key_hash, user_id: uid, org_id: orgId, is_active: true };
      if (expiresAt) payload.expires_at = new Date(expiresAt).toISOString();
      await createResource('api-keys', payload);
      setModal(false);
      setName('');
      setExpiresAt('');
      setRevealed(raw);
      mutate();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function openEdit(k: ApiKey) {
    setEditTarget(k);
    setEditExpiresAt(k.expires_at ? k.expires_at.slice(0, 10) : '');
    setEditErr(null);
  }

  async function saveEdit() {
    if (!editTarget) return;
    setEditBusy(true);
    setEditErr(null);
    try {
      const payload: Record<string, unknown> = { expires_at: editExpiresAt ? new Date(editExpiresAt).toISOString() : null };
      await updateResource('api-keys', editTarget.id, payload);
      setEditTarget(null);
      mutate();
    } catch (e) {
      setEditErr((e as ApiError).message);
    } finally {
      setEditBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revokeTarget) return;
    setRevokeBusy(true);
    setRevokeErr(null);
    try {
      await updateResource('api-keys', revokeTarget.id, { is_active: false });
      setRevokeTarget(null);
      mutate();
    } catch (e) {
      setRevokeErr((e as ApiError).message);
    } finally {
      setRevokeBusy(false);
    }
  }

  // Filter by active state, then by org-tree membership.
  const visibleKeys = useMemo(() => {
    let list = activeOnly ? keys.filter((k) => k.is_active) : keys;
    if (allowedOrgIds.size > 0) list = list.filter((k) => allowedOrgIds.has(k.org_id));
    return list;
  }, [keys, activeOnly, allowedOrgIds]);

  const isExpired = (k: ApiKey) => !!k.expires_at && new Date(k.expires_at) < new Date();

  const columns: Column<ApiKey & Record<string, unknown>>[] = [
    { key: 'name', label: 'Token', render: (k) => <span className="cell-strong">{k.name}</span> },
    { key: 'user_id', label: 'User', render: (k) => <span style={{ color: 'var(--text-secondary)' }}>{userMap.get(k.user_id) ?? k.user_id.slice(0, 8) + '…'}</span> },
    { key: 'created_at', label: 'Publish Date', render: (k) => <span style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(k.created_at)}</span> },
    {
      key: 'expires_at',
      label: 'Expiry Date',
      render: (k) => k.expires_at
        ? <span style={{ color: isExpired(k) ? 'var(--support-error)' : 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{fmtDate(k.expires_at)}</span>
        : <span className="muted">No expiry</span>,
    },
    { key: 'scope', label: 'Scope', render: (k) => <Tag color="blue" sm>{k.scope ?? 'full'}</Tag> },
    { key: 'key_hash', label: 'Hash', render: (k) => <span className="mono" style={{ fontSize: 11, color: 'var(--text-helper)' }}>{String(k.key_hash).slice(0, 16)}…</span> },
    { key: 'is_active', label: 'Status', render: (k) => (k.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="red" sm>revoked</Tag>) },
    {
      key: '__a',
      label: '',
      width: 130,
      render: (k) => (
        <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
          <Btn kind="ghost" size="sm" icon="edit" title="Edit expiry" onClick={() => openEdit(k as ApiKey)} />
          {k.is_active
            ? <Btn kind="danger-ghost" size="sm" icon="trash" title="Revoke" onClick={() => { setRevokeErr(null); setRevokeTarget(k as ApiKey); }} />
            : <span style={{ width: 32 }} />}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHead title="API Tokens" sub="Personal and virtual-account tokens. The raw key is shown once at creation and stored only as a SHA-256 hash." actions={<Btn kind="primary" size="sm" icon="add" onClick={() => setModal(true)}>Create token</Btn>} />
      <Section style={{ paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Toggle on={activeOnly} onChange={setActiveOnly} />
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{activeOnly ? 'Active only' : 'All tokens'}</span>
        </div>
        <div className="dt-wrap">
          {isLoading ? <div className="empty" style={{ padding: 48 }}>Loading…</div> : <DataTable columns={columns} rows={visibleKeys as (ApiKey & Record<string, unknown>)[]} getKey={(k) => k.id} sortable={false} />}
        </div>
      </Section>

      {modal && (
        <Modal
          title="Create token"
          label="API Tokens"
          size="sm"
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn kind="primary" iconRight="key" onClick={create} disabled={busy || !name.trim()}>{busy ? 'Generating…' : 'Generate'}</Btn>
            </>
          }
        >
          {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not create">{err}</Notif></div>}
          <Field label="Token name"><Input value={name} onChange={setName} placeholder="web-app-prod" /></Field>
          <Field label="Scope"><Select value={scope} onChange={setScope} options={['full', 'read_only', 'write']} /></Field>
          <Field label="Owner"><Select value={userId} onChange={setUserId} options={[{ value: '', label: '— first user —' }, ...allowedUsers.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
          <Field label="Expiry date (optional)">
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
                background: 'var(--field-01)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </Field>
        </Modal>
      )}

      {editTarget && (
        <Modal
          title="Edit token expiry"
          label="API Tokens"
          size="sm"
          onClose={() => setEditTarget(null)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setEditTarget(null)} disabled={editBusy}>Cancel</Btn>
              <Btn kind="primary" icon="save" onClick={saveEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</Btn>
            </>
          }
        >
          {editErr && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not save">{editErr}</Notif></div>}
          <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--layer-02)', borderRadius: 4, fontSize: 13, color: 'var(--text-secondary)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{editTarget.name}</span>
            <span style={{ marginLeft: 8 }}><Tag color="blue" sm>{editTarget.scope ?? 'full'}</Tag></span>
          </div>
          <Field label="Expiry date (leave blank to remove expiry)">
            <input
              type="date"
              value={editExpiresAt}
              onChange={(e) => setEditExpiresAt(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid var(--border-strong)',
                borderRadius: 4,
                background: 'var(--field-01)',
                color: 'var(--text-primary)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </Field>
          {editExpiresAt && new Date(editExpiresAt) < new Date() && (
            <Notif kind="warn" title="Date is in the past">This will immediately mark the token as expired.</Notif>
          )}
        </Modal>
      )}

      {revokeTarget && (
        <Modal
          title="Revoke token"
          label="API Tokens"
          size="sm"
          onClose={() => setRevokeTarget(null)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setRevokeTarget(null)} disabled={revokeBusy}>Cancel</Btn>
              <Btn kind="danger" onClick={confirmRevoke} disabled={revokeBusy}>{revokeBusy ? 'Revoking…' : 'Revoke token'}</Btn>
            </>
          }
        >
          {revokeErr && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not revoke">{revokeErr}</Notif></div>}
          <Notif kind="warn" title="This action cannot be undone">
            Any application or service using <strong>{revokeTarget.name}</strong> will immediately lose access. The token cannot be re-activated.
          </Notif>
        </Modal>
      )}

      {revealed && (
        <Modal
          title="Copy your new token"
          label="API Tokens"
          size="sm"
          onClose={() => setRevealed(null)}
          footer={<Btn kind="primary" onClick={() => setRevealed(null)}>Done</Btn>}
        >
          <Notif kind="warn" title="This key will not be shown again">Store it securely now. Only its hash is kept.</Notif>
          <div style={{ marginTop: 16, padding: 14, background: 'var(--layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <code className="mono" style={{ flex: 1, fontSize: 13, wordBreak: 'break-all' }}>{revealed}</code>
            <Btn kind="ghost" size="sm" icon="copy" title="Copy" onClick={() => navigator.clipboard?.writeText(revealed)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
