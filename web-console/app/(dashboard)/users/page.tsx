'use client';

/**
 * Administration → Users & Roles.
 *  - Users  : CRUD over `users` (delete = deactivate)
 *  - Roles  : CRUD over `roles`
 *  - RBAC   : role × resource:action matrix backed by `role-permissions`
 *             (toggling a cell POST/DELETEs a link row; batched on save)
 */

import { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { PageHead, Tabs, Tag, Btn, Check, Notif, Modal, Field, Input, Select, Toggle, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { ResourceCrud } from '@/components/common/ResourceCrud';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, deleteResource, ApiError } from '@/lib/api/resources';
import { validate } from '@/lib/validation';
import type { User, Role, RolePermission, Organization } from '@/lib/types';

const AUTH_PROVIDERS = ['local', 'entra', 'ad', 'virtual_account'];
const emptyUser = { name: '', email: '', org_id: '', auth_provider: 'local', external_id: '', is_active: true };

/** Full create-user form with two-layer validation (client + BFF). */
function CreateUserModal({ orgs, defaultOrg, onClose, onCreated }: { orgs: Organization[]; defaultOrg?: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ ...emptyUser, org_id: defaultOrg ?? '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setErr(null);
    if (!form.org_id) return setErr({ field: 'org_id', msg: 'Organization is required' });
    const payload = {
      name: form.name,
      email: form.email,
      org_id: form.org_id,
      auth_provider: form.auth_provider,
      external_id: form.external_id || null,
      is_active: form.is_active,
    };
    // Client-side pass; BFF re-validates.
    const v = validate('users', payload, false);
    if (v) return setErr({ field: v.field, msg: v.error });
    setBusy(true);
    try {
      await createResource('users', payload);
      onCreated();
      onClose();
    } catch (e) {
      const ae = e as ApiError;
      setErr({ field: ae.field, msg: ae.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Create user"
      label="Users"
      onClose={onClose}
      footer={
        <>
          <Btn kind="secondary" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" iconRight="arrowRight" onClick={save} disabled={busy || !form.name.trim() || !form.email.trim()}>
            {busy ? 'Creating…' : 'Create user'}
          </Btn>
        </>
      }
    >
      {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not create user">{err.msg}</Notif></div>}
      <Field label="Full name" error={err?.field === 'name' ? err.msg : undefined}>
        <Input value={form.name} onChange={(v) => set('name', v)} placeholder="Eve Chen" />
      </Field>
      <Field label="Email" help="Must be a unique, valid address" error={err?.field === 'email' ? err.msg : undefined}>
        <Input value={form.email} onChange={(v) => set('email', v)} placeholder="eve@betalabs.io" mono />
      </Field>
      <Field label="Organization" error={err?.field === 'org_id' ? err.msg : undefined}>
        <Select value={form.org_id} onChange={(v) => set('org_id', v)} options={[{ value: '', label: '— select organization —' }, ...orgs.map((o) => ({ value: o.id, label: o.name }))]} />
      </Field>
      <Field label="Auth provider" error={err?.field === 'auth_provider' ? err.msg : undefined}>
        <Select value={form.auth_provider} onChange={(v) => set('auth_provider', v)} options={AUTH_PROVIDERS} />
      </Field>
      <Field label="External ID" help="Optional — SSO subject / object id for Entra or AD">
        <Input value={form.external_id} onChange={(v) => set('external_id', v)} placeholder="00000000-0000-…" mono />
      </Field>
      <Field label="Active">
        <Toggle on={form.is_active} onChange={(v) => set('is_active', v)} label={form.is_active ? 'Active' : 'Inactive'} />
      </Field>
    </Modal>
  );
}

const RESOURCE_ACTIONS = [
  'virtual-models:read', 'virtual-models:write', 'models:read', 'models:write',
  'prompt-registries:read', 'prompt-registries:write', 'mcp-servers:manage',
  'guardrail-profiles:manage', 'budgets:manage', 'rate-limits:manage',
  'users:manage', 'roles:manage', 'request-logs:read',
];

function RbacMatrix() {
  const { data: roles } = useResourceList<Role>('roles', { limit: 500 });
  const { data: perms, mutate } = useResourceList<RolePermission>('role-permissions', { limit: 500 });
  const [pending, setPending] = useState<Record<string, 'add' | 'remove'>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const has = useMemo(() => {
    const set = new Set<string>();
    perms.forEach((p) => set.add(`${p.role_id}:${p.resource}:${p.action}`));
    return set;
  }, [perms]);

  const cellState = (roleId: string, ra: string) => {
    const key = `${roleId}:${ra}`;
    const base = has.has(key);
    const p = pending[key];
    return p === 'add' ? true : p === 'remove' ? false : base;
  };
  const toggle = (roleId: string, ra: string) => {
    const key = `${roleId}:${ra}`;
    const base = has.has(key);
    const next = !cellState(roleId, ra);
    setPending((s) => {
      const copy = { ...s };
      if (next === base) delete copy[key];
      else copy[key] = next ? 'add' : 'remove';
      return copy;
    });
  };

  async function saveAll() {
    setBusy(true);
    setMsg(null);
    try {
      for (const [key, op] of Object.entries(pending)) {
        const [roleId, resource, action] = key.split(':');
        if (op === 'add') {
          await createResource('role-permissions', { role_id: roleId, resource, action, is_active: true });
        } else {
          const existing = perms.find((p) => p.role_id === roleId && p.resource === resource && p.action === action);
          if (existing) await deleteResource('role-permissions', existing.id);
        }
      }
      setPending({});
      mutate();
      setMsg('Permissions saved.');
    } catch (e) {
      setMsg((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = Object.keys(pending).length;

  return (
    <Section style={{ paddingTop: 16 }}>
      {msg && <div style={{ marginBottom: 12 }}><Notif kind="info" onClose={() => setMsg(null)}>{msg}</Notif></div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <Btn kind="primary" size="sm" icon="save" disabled={busy || pendingCount === 0} onClick={saveAll}>
          {busy ? 'Saving…' : `Save changes${pendingCount ? ` (${pendingCount})` : ''}`}
        </Btn>
      </div>
      <div className="dt-wrap" style={{ overflowX: 'auto' }}>
        <table className="dt compact">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--layer-accent)' }}>Role</th>
              {RESOURCE_ACTIONS.map((ra) => (
                <th key={ra} style={{ writingMode: 'vertical-rl', textAlign: 'left', height: 130, fontSize: 11 }}>{ra}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr className="row" key={role.id}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--layer-01)' }}>
                  <span className="cell-strong">{role.name}</span>
                </td>
                {RESOURCE_ACTIONS.map((ra) => (
                  <td key={ra} style={{ textAlign: 'center' }}>
                    <Check checked={cellState(role.id, ra)} onChange={() => toggle(role.id, ra)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export default function UsersPage() {
  const orgId = useDefaultOrgId();
  const { mutate } = useSWRConfig();
  const { data: orgs } = useResourceList<Organization>('organizations', { limit: 500 });
  const [tab, setTab] = useState('users');
  const [createOpen, setCreateOpen] = useState(false);

  // Revalidate any cached users list (the table inside ResourceCrud).
  const refreshUsers = () => mutate((key) => Array.isArray(key) && key[0] === 'list' && key[1] === 'users');

  const userCols: Column<User & Record<string, unknown>>[] = [
    { key: 'name', label: 'Name', render: (u) => <span className="cell-strong">{u.name}</span> },
    { key: 'email', label: 'Email', render: (u) => <span className="mono" style={{ fontSize: 12 }}>{u.email}</span> },
    { key: 'auth_provider', label: 'Provider', render: (u) => <Tag color="blue" sm>{u.auth_provider ?? 'local'}</Tag> },
    { key: 'is_active', label: 'Status', render: (u) => (u.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="gray" sm>inactive</Tag>) },
  ];
  const roleCols: Column<Role & Record<string, unknown>>[] = [
    { key: 'name', label: 'Role', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'description', label: 'Description', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.description ?? '—'}</span> },
    { key: 'scope', label: 'Scope', render: (r) => <Tag color="cyan" sm>{r.scope ?? 'org'}</Tag> },
    { key: 'is_system', label: 'Type', render: (r) => (r.is_system ? <Tag color="purple" sm>system</Tag> : <Tag color="gray" sm>custom</Tag>) },
  ];

  return (
    <div>
      <PageHead title="Users & Roles" sub="Manage members, define roles, and grant resource permissions via the RBAC matrix." />
      <Section style={{ paddingTop: 16 }}>
        <Tabs active={tab} onChange={setTab} tabs={[{ id: 'users', label: 'Users' }, { id: 'roles', label: 'Roles' }, { id: 'rbac', label: 'RBAC Matrix' }]} />
      </Section>

      {tab === 'users' && (
        <>
          <ResourceCrud<User>
            embedded
            resource="users"
            title="Users"
            addLabel="Invite user"
            softDelete
            getKey={(u) => u.id}
            searchKeys={['name', 'email']}
            createDefaults={orgId ? { org_id: orgId, is_active: true } : { is_active: true }}
            columns={userCols}
            headerActions={<Btn kind="tertiary" size="sm" icon="users" onClick={() => setCreateOpen(true)}>Create user</Btn>}
            fields={[
              { key: 'name', label: 'Name', placeholder: 'Maya Tarigan' },
              { key: 'email', label: 'Email', placeholder: 'maya@pangreksa.io' },
              { key: 'auth_provider', label: 'Auth provider', type: 'select', options: ['local', 'entra', 'ad', 'virtual_account'], default: 'local' },
              { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
            ]}
          />
          {createOpen && <CreateUserModal orgs={orgs} defaultOrg={orgId} onClose={() => setCreateOpen(false)} onCreated={refreshUsers} />}
        </>
      )}
      {tab === 'roles' && (
        <ResourceCrud<Role>
          embedded
          resource="roles"
          title="Roles"
          addLabel="Create role"
          getKey={(r) => r.id}
          searchKeys={['name']}
          createDefaults={orgId ? { org_id: orgId, is_active: true } : { is_active: true }}
          columns={roleCols}
          fields={[
            { key: 'name', label: 'Name', placeholder: 'Gateway Admin' },
            { key: 'description', label: 'Description', type: 'textarea', nullable: true },
            { key: 'scope', label: 'Scope', type: 'select', options: ['org', 'global', 'project'], default: 'org' },
          ]}
        />
      )}
      {tab === 'rbac' && <RbacMatrix />}
    </div>
  );
}
