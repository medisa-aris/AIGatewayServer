'use client';

/**
 * Administration → API Tokens. CRUD over `api-keys`.
 * Create generates a random raw key client-side, stores only its SHA-256 hash,
 * and reveals the raw key once. Revoke = PATCH is_active:false.
 */

import { useState } from 'react';
import { PageHead, Btn, Tag, Modal, Field, Input, Select, Notif, DataTable, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, updateResource, ApiError } from '@/lib/api/resources';
import type { ApiKey, User } from '@/lib/types';

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
  return `pk-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export default function TokensPage() {
  const orgId = useDefaultOrgId();
  const { data: keys, isLoading, mutate } = useResourceList<ApiKey>('api-keys', { limit: 500 });
  const { data: users } = useResourceList<User>('users', { limit: 500 });

  const [modal, setModal] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('full');
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      const raw = randomKey();
      const key_hash = await sha256Hex(raw);
      const uid = userId || users[0]?.id;
      await createResource('api-keys', { name, scope, key_hash, user_id: uid, org_id: orgId, is_active: true });
      setModal(false);
      setName('');
      setRevealed(raw);
      mutate();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke token "${k.name}"?`)) return;
    try {
      await updateResource('api-keys', k.id, { is_active: false });
      mutate();
    } catch (e) {
      alert((e as ApiError).message);
    }
  }

  const columns: Column<ApiKey & Record<string, unknown>>[] = [
    { key: 'name', label: 'Token', render: (k) => <span className="cell-strong">{k.name}</span> },
    { key: 'scope', label: 'Scope', render: (k) => <Tag color="blue" sm>{k.scope ?? 'full'}</Tag> },
    { key: 'key_hash', label: 'Hash', render: (k) => <span className="mono" style={{ fontSize: 11, color: 'var(--text-helper)' }}>{String(k.key_hash).slice(0, 16)}…</span> },
    { key: 'is_active', label: 'Status', render: (k) => (k.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="red" sm>revoked</Tag>) },
    {
      key: '__a',
      label: '',
      width: 90,
      render: (k) => (k.is_active ? <Btn kind="danger-ghost" size="sm" icon="trash" title="Revoke" onClick={() => revoke(k as ApiKey)} /> : <span className="muted">—</span>),
    },
  ];

  return (
    <div>
      <PageHead title="API Tokens" sub="Personal and virtual-account tokens. The raw key is shown once at creation and stored only as a SHA-256 hash." actions={<Btn kind="primary" size="sm" icon="add" onClick={() => setModal(true)}>Create token</Btn>} />
      <Section style={{ paddingTop: 20 }}>
        <div className="dt-wrap">
          {isLoading ? <div className="empty" style={{ padding: 48 }}>Loading…</div> : <DataTable columns={columns} rows={keys as (ApiKey & Record<string, unknown>)[]} getKey={(k) => k.id} sortable={false} />}
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
          <Field label="Owner"><Select value={userId} onChange={setUserId} options={[{ value: '', label: '— first user —' }, ...users.map((u) => ({ value: u.id, label: u.name }))]} /></Field>
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
