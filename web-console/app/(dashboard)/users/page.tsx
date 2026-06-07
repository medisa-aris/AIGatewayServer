'use client';

/**
 * Administration → Users & Roles.
 *  - Users  : CRUD over `users` (delete = deactivate); add/edit modal is a
 *             two-panel form — user details on the left, role assignment on the right.
 *  - Roles  : CRUD over `roles`
 *  - RBAC   : role × resource:action matrix backed by `role-permissions`
 *             (toggling a cell POST/DELETEs a link row; batched on save)
 */

import React, { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { PageHead, Tabs, Tag, Btn, Check, Notif, Modal, Field, Input, Select, Toggle, type Column } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { ResourceCrud, type FieldDef } from '@/components/common/ResourceCrud';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, updateResource, deleteResource, ApiError } from '@/lib/api/resources';
import { validate } from '@/lib/validation';
import type { User, Role, UserRole, RolePermission, Organization } from '@/lib/types';

const AUTH_PROVIDERS = ['local', 'entra', 'ad', 'virtual_account'];

/** Sorts orgs into parent-first DFS order and prefixes children with indentation. */
function buildHierarchicalOrgOptions(orgs: Organization[]): { value: string; label: string }[] {
  const childrenOf = new Map<string | null, Organization[]>();
  for (const o of orgs) {
    const parentId = (o.settings as Record<string, unknown> | null)?.parent_org_id as string | undefined ?? null;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId)!.push(o);
  }
  const result: { value: string; label: string }[] = [];
  const visited = new Set<string>();
  function walk(parentId: string | null, depth: number) {
    for (const org of childrenOf.get(parentId) ?? []) {
      visited.add(org.id);
      const prefix = depth === 0 ? '' : '  '.repeat(depth) + '↳ ';
      result.push({ value: org.id, label: prefix + org.name });
      walk(org.id, depth + 1);
    }
  }
  walk(null, 0);
  // Append orphans (parent_org_id points to a missing org).
  for (const o of orgs) {
    if (!visited.has(o.id)) result.push({ value: o.id, label: o.name });
  }
  return result;
}

/** Right-side panel: main role (single select) + supporting roles (multi-check). */
function RolePanel({
  roles,
  mainRoleId,
  supportingIds,
  onMainChange,
  onSupportingToggle,
}: {
  roles: Role[];
  mainRoleId: string;
  supportingIds: string[];
  onMainChange: (id: string) => void;
  onSupportingToggle: (id: string) => void;
}) {
  return (
    <div>
      <Field label="Main role" help="The user's primary role (optional)">
        <Select
          value={mainRoleId}
          onChange={onMainChange}
          options={[
            { value: '', label: '— no main role —' },
            ...roles.map((r) => ({ value: r.id, label: r.name })),
          ]}
        />
      </Field>
      <Field label="Supporting roles" help="Additional roles — optional, select any that apply">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          {roles.length === 0 && (
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>No roles defined yet.</span>
          )}
          {roles.map((role) => {
            const isMain = role.id === mainRoleId;
            const isChecked = supportingIds.includes(role.id);
            return (
              <label
                key={role.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: isMain ? 0.4 : 1,
                  cursor: isMain ? 'not-allowed' : 'pointer',
                  fontSize: 14, userSelect: 'none',
                }}
              >
                <Check checked={isChecked} onChange={() => !isMain && onSupportingToggle(role.id)} />
                <span>{role.name}</span>
                {role.scope && <Tag color="cyan" sm>{role.scope}</Tag>}
              </label>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

/** Unified add/edit user modal with two-panel layout (details left, role assignment right). */
function UserFormModal({
  user,
  orgs,
  roles,
  existingUserRoles,
  onClose,
  onSaved,
}: {
  user?: User;
  orgs: Organization[];
  roles: Role[];
  existingUserRoles: UserRole[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const orgOptions = useMemo(() => buildHierarchicalOrgOptions(orgs), [orgs]);

  const [form, setForm] = useState({
    name: user?.name ?? '',
    email: user?.email ?? '',
    org_id: user?.org_id ?? '',
    auth_provider: user?.auth_provider ?? 'local',
    external_id: (user?.external_id as string | null) ?? '',
    is_active: user?.is_active ?? true,
  });

  const [mainRoleId, setMainRoleId] = useState<string>(
    existingUserRoles.find(
      (ur) => (ur.context as Record<string, unknown> | null)?.is_primary === true
    )?.role_id ?? ''
  );
  const [supportingIds, setSupportingIds] = useState<string[]>(
    existingUserRoles
      .filter((ur) => (ur.context as Record<string, unknown> | null)?.is_primary !== true)
      .map((ur) => ur.role_id)
  );

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  function handleMainRoleChange(roleId: string) {
    setMainRoleId(roleId);
    setSupportingIds((prev) => prev.filter((id) => id !== roleId));
  }

  function toggleSupporting(roleId: string) {
    if (roleId === mainRoleId) return;
    setSupportingIds((prev) =>
      prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]
    );
  }

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
    const v = validate('users', payload, isEdit);
    if (v) return setErr({ field: v.field, msg: v.error });
    setBusy(true);
    try {
      let userId: string;
      if (isEdit) {
        await updateResource('users', user!.id, payload);
        userId = user!.id;

        const oldMainId = existingUserRoles.find(
          (ur) => (ur.context as Record<string, unknown> | null)?.is_primary === true
        )?.role_id ?? '';
        const oldSupportIds = existingUserRoles
          .filter((ur) => (ur.context as Record<string, unknown> | null)?.is_primary !== true)
          .map((ur) => ur.role_id);

        const allNewIds = new Set([...(mainRoleId ? [mainRoleId] : []), ...supportingIds]);
        const toDelete = existingUserRoles.filter((ur) => !allNewIds.has(ur.role_id));
        for (const ur of toDelete) await deleteResource('user-roles', ur.id);

        if (mainRoleId && mainRoleId !== oldMainId) {
          // If this role was a supporting role before, remove that row first.
          const wasSupporting = existingUserRoles.find(
            (ur) => ur.role_id === mainRoleId && (ur.context as Record<string, unknown> | null)?.is_primary !== true
          );
          if (wasSupporting) await deleteResource('user-roles', wasSupporting.id);
          await createResource('user-roles', { user_id: userId, role_id: mainRoleId, context: { is_primary: true } });
        }

        const newSupporting = supportingIds.filter((id) => !oldSupportIds.includes(id) && id !== oldMainId);
        for (const id of newSupporting) {
          await createResource('user-roles', { user_id: userId, role_id: id, context: {} });
        }
      } else {
        const created = await createResource('users', payload) as Record<string, unknown>;
        userId = (created.id ?? (created.data as Record<string, unknown>)?.id) as string;
        if (mainRoleId) {
          await createResource('user-roles', { user_id: userId, role_id: mainRoleId, context: { is_primary: true } });
        }
        for (const id of supportingIds) {
          await createResource('user-roles', { user_id: userId, role_id: id, context: {} });
        }
      }
      onSaved();
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
      title={isEdit ? 'Edit user' : 'Create user'}
      label="Users"
      size="xl"
      onClose={onClose}
      footer={
        <>
          <Btn kind="secondary" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" iconRight="arrowRight" onClick={save}
            disabled={busy || !form.name.trim() || !form.email.trim()}>
            {busy ? (isEdit ? 'Saving…' : 'Creating…') : isEdit ? 'Save changes' : 'Create user'}
          </Btn>
        </>
      }
    >
      {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title={isEdit ? 'Could not save user' : 'Could not create user'}>{err.msg}</Notif></div>}
      <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>

        {/* Section 1 — User details */}
        <div style={{ flex: '0 0 300px' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '0 0 16px' }}>
            USER DETAILS
          </p>
          <Field label="Full name" error={err?.field === 'name' ? err.msg : undefined}>
            <Input value={form.name} onChange={(v) => set('name', v)} placeholder="Eve Chen" />
          </Field>
          <Field label="Email" help="Must be a unique, valid address" error={err?.field === 'email' ? err.msg : undefined}>
            <Input value={form.email} onChange={(v) => set('email', v)} placeholder="eve@betalabs.io" mono />
          </Field>
          <Field label="Organization" error={err?.field === 'org_id' ? err.msg : undefined}>
            <Select
              value={form.org_id}
              onChange={(v) => set('org_id', v)}
              options={[{ value: '', label: '— select organization —' }, ...orgOptions]}
            />
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
        </div>

        {/* Divider */}
        <div style={{ width: 1, background: 'var(--border-subtle-01)', alignSelf: 'stretch', flexShrink: 0 }} />

        {/* Section 2 — Role assignment */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.08em', margin: '0 0 16px' }}>
            ROLE ASSIGNMENT
          </p>
          <RolePanel
            roles={roles}
            mainRoleId={mainRoleId}
            supportingIds={supportingIds}
            onMainChange={handleMainRoleChange}
            onSupportingToggle={toggleSupporting}
          />
        </div>
      </div>
    </Modal>
  );
}

const ACTIONS = ['access', 'read', 'write', 'delete'] as const;
type RbacAction = typeof ACTIONS[number];

const ACTION_ABBR: Record<RbacAction, string> = { access: 'A', read: 'R', write: 'W', delete: 'D' };
const ACTION_TITLE: Record<RbacAction, string> = {
  access: 'Access — can see the menu item',
  read: 'Read — can list and view items',
  write: 'Write — can create and edit items',
  delete: 'Delete — can soft-delete or hard-delete items',
};

interface ResourceDef { id: string; label: string; group: string; }

const RESOURCES: ResourceDef[] = [
  // Monitor — analytics screens
  { id: 'overview',           label: 'Overview',           group: 'Monitor' },
  { id: 'model-metrics',      label: 'Model Metrics',      group: 'Monitor' },
  { id: 'guardrail-activity', label: 'Guardrail Activity', group: 'Monitor' },
  { id: 'request-logs',       label: 'Request Logs',       group: 'Monitor' },
  { id: 'dimensional',        label: 'Dimensional Viewer', group: 'Monitor' },
  // Gateway — upstream connectivity
  { id: 'provider-accounts',  label: 'Provider Accounts',  group: 'Gateway' },
  { id: 'virtual-models',     label: 'Virtual Models',     group: 'Gateway' },
  { id: 'proxy',              label: 'Proxy',              group: 'Gateway' },
  { id: 'proxy-services',     label: 'Proxy Services',     group: 'Gateway' },
  // Registry — shared artifacts
  { id: 'prompt-registries',  label: 'Prompts',            group: 'Registry' },
  { id: 'mcp-servers',        label: 'MCP Servers',        group: 'Registry' },
  { id: 'skills',             label: 'Skills',             group: 'Registry' },
  // Policies — governance
  { id: 'guardrail-profiles', label: 'Guardrails',         group: 'Policies' },
  { id: 'pii-objects',        label: 'PII Protection',     group: 'Policies' },
  { id: 'budgets',            label: 'Budgets',            group: 'Policies' },
  { id: 'rate-limits',        label: 'Rate Limits',        group: 'Policies' },
  // Administration — org & identity
  { id: 'users',              label: 'Users',              group: 'Administration' },
  { id: 'roles',              label: 'Roles',              group: 'Administration' },
  { id: 'organizations',      label: 'Organization',       group: 'Administration' },
  { id: 'api-keys',           label: 'API Tokens',         group: 'Administration' },
  { id: 'auth',               label: 'Authentication',     group: 'Administration' },
  { id: 'erd',                label: 'Database ERD',       group: 'Administration' },
  { id: 'config',             label: 'Configuration',      group: 'Administration' },
];

// Pre-computed: which resource IDs start a new nav group (used for left-border separators).
const GROUP_STARTERS = new Set(
  RESOURCES.filter((r, i) => i === 0 || RESOURCES[i - 1]?.group !== r.group).map((r) => r.id)
);

// Ordered group list: [groupName, resources[]] pairs.
const GROUPS: [string, ResourceDef[]][] = Array.from(
  RESOURCES.reduce((m, r) => {
    if (!m.has(r.group)) m.set(r.group, []);
    m.get(r.group)!.push(r);
    return m;
  }, new Map<string, ResourceDef[]>())
);

/** Thin vertical separator between nav groups; thick within a group between resources. */
const GROUP_SEP: React.CSSProperties  = { borderLeft: '2px solid var(--border-strong, #8d8d8d)' };
const RSRC_SEP: React.CSSProperties  = { borderLeft: '1px solid var(--border-subtle-2, #c6c6c6)' };

/** Per-group accent colours — background tint for the group header row. */
const GROUP_COLOR: Record<string, string> = {
  Monitor:        'var(--layer-02)',
  Gateway:        'var(--layer-02)',
  Registry:       'var(--layer-02)',
  Policies:       'var(--layer-02)',
  Administration: 'var(--layer-02)',
};

/** Solid badge colours for the legend — fully opaque, high contrast. */
const ACTION_COLOR: Record<RbacAction, { bg: string; text: string }> = {
  access: { bg: '#0f62fe', text: '#ffffff' }, // IBM blue
  read:   { bg: '#198038', text: '#ffffff' }, // IBM green
  write:  { bg: '#f1620a', text: '#ffffff' }, // IBM orange
  delete: { bg: '#da1e28', text: '#ffffff' }, // IBM red
};

/** Column tints applied to table cells — light wash matching each action's badge colour. */
const ACTION_BG: Record<RbacAction, string> = {
  access: 'rgba(15,98,254,0.08)',
  read:   'rgba(25,128,56,0.08)',
  write:  'rgba(241,98,10,0.08)',
  delete: 'rgba(218,30,40,0.08)',
};

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

  const cellState = (roleId: string, resource: string, action: RbacAction) => {
    const key = `${roleId}:${resource}:${action}`;
    const base = has.has(key);
    const p = pending[key];
    return p === 'add' ? true : p === 'remove' ? false : base;
  };

  const toggle = (roleId: string, resource: string, action: RbacAction) => {
    const key = `${roleId}:${resource}:${action}`;
    const base = has.has(key);
    const next = !cellState(roleId, resource, action);
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
        // key: "<uuid>:<resource>:<action>" — UUID has no colons.
        const first  = key.indexOf(':');
        const second = key.indexOf(':', first + 1);
        const roleId   = key.slice(0, first);
        const resource = key.slice(first + 1, second);
        const action   = key.slice(second + 1);
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
      {/* ── Legend ── */}
      <div style={{
        display: 'flex', gap: 0, marginBottom: 14,
        border: '1px solid var(--border-subtle)', background: 'var(--layer-02)',
        width: 'fit-content',
      }}>
        {ACTIONS.map((a, i) => (
          <div key={a} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 16px',
            borderLeft: i > 0 ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <span style={{
              width: 22, height: 22, borderRadius: 3,
              background: ACTION_COLOR[a].bg,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
              color: ACTION_COLOR[a].text,
              flexShrink: 0,
              letterSpacing: 0,
            }}>
              {ACTION_ABBR[a]}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              {ACTION_TITLE[a].split(' — ')[1]}
            </span>
          </div>
        ))}
      </div>

      {msg && <div style={{ marginBottom: 12 }}><Notif kind="info" onClose={() => setMsg(null)}>{msg}</Notif></div>}

      <div className="dt-wrap" style={{ overflowX: 'auto' }}>
        <table className="dt compact" style={{ borderCollapse: 'collapse', minWidth: 'max-content', tableLayout: 'fixed' }}>
          <colgroup>
            {/* sticky role column */}
            <col style={{ width: 140 }} />
            {/* one col per action per resource */}
            {RESOURCES.flatMap((r) =>
              ACTIONS.map((a) => <col key={`${r.id}:${a}`} style={{ width: 26 }} />)
            )}
          </colgroup>

          <thead>
            {/* ── Row 1: nav group spans ── */}
            <tr>
              <th rowSpan={3} style={{
                position: 'sticky', left: 0, zIndex: 2,
                background: 'var(--layer-accent)',
                verticalAlign: 'bottom', padding: '0 16px 8px',
                height: 'auto', minWidth: 140,
              }}>
                Role
              </th>
              {GROUPS.map(([group, res], gi) => (
                <th
                  key={group}
                  colSpan={res.length * 4}
                  style={{
                    textAlign: 'center',
                    fontSize: 10, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                    color: 'var(--text-helper, var(--text-secondary))',
                    padding: '5px 4px 4px',
                    height: 'auto',
                    background: GROUP_COLOR[group] ?? 'var(--layer-02)',
                    ...(gi > 0 ? GROUP_SEP : {}),
                  }}
                >
                  {group}
                </th>
              ))}
            </tr>

            {/* ── Row 2: resource names (vertical text, colSpan=4) ── */}
            <tr>
              {RESOURCES.map((r, ri) => {
                const isGroupStart = GROUP_STARTERS.has(r.id);
                const prevIsGroupStart = ri > 0 && GROUP_STARTERS.has(RESOURCES[ri - 1]?.id ?? '');
                return (
                  <th
                    key={r.id}
                    colSpan={4}
                    style={{
                      textAlign: 'center',
                      height: 100, padding: 0,
                      verticalAlign: 'bottom',
                      background: 'var(--layer-accent)',
                      ...(isGroupStart ? GROUP_SEP : (ri > 0 && !prevIsGroupStart ? RSRC_SEP : {})),
                    }}
                  >
                    <div style={{
                      writingMode: 'vertical-rl',
                      transform: 'rotate(180deg)',
                      fontSize: 11, fontWeight: 600,
                      whiteSpace: 'nowrap',
                      padding: '4px 6px',
                      color: 'var(--text-primary)',
                      display: 'inline-block',
                    }}>
                      {r.label}
                    </div>
                  </th>
                );
              })}
            </tr>

            {/* ── Row 3: A / R / W / D initials — solid badge colour per action ── */}
            <tr>
              {RESOURCES.flatMap((r) =>
                ACTIONS.map((a, ai) => (
                  <th
                    key={`${r.id}:${a}`}
                    title={ACTION_TITLE[a]}
                    style={{
                      textAlign: 'center',
                      fontSize: 9, fontWeight: 700,
                      padding: '4px 0 5px',
                      height: 'auto',
                      background: ACTION_COLOR[a].bg,
                      color: ACTION_COLOR[a].text,
                      ...(ai === 0 ? (GROUP_STARTERS.has(r.id) ? GROUP_SEP : RSRC_SEP) : {}),
                    }}
                  >
                    {ACTION_ABBR[a]}
                  </th>
                ))
              )}
            </tr>
          </thead>

          <tbody>
            {roles.map((role) => (
              <tr className="row" key={role.id}>
                <td style={{
                  position: 'sticky', left: 0, zIndex: 1,
                  background: 'var(--layer-01)',
                  padding: '0 16px', fontWeight: 500,
                }}>
                  <span className="cell-strong">{role.name}</span>
                </td>
                {RESOURCES.flatMap((r) =>
                  ACTIONS.map((a, ai) => (
                    <td
                      key={`${r.id}:${a}`}
                      style={{
                        textAlign: 'center', padding: '0 0',
                        background: ACTION_BG[a],
                        ...(ai === 0 ? (GROUP_STARTERS.has(r.id) ? GROUP_SEP : RSRC_SEP) : {}),
                      }}
                    >
                      <Check checked={cellState(role.id, r.id, a)} onChange={() => toggle(role.id, r.id, a)} />
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Sticky save bar — only visible when there are unsaved changes ── */}
      {pendingCount > 0 && (
        <div style={{
          position: 'sticky', bottom: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 0',
          marginTop: 1,
          borderTop: '2px solid var(--brand)',
          background: 'var(--layer-01)',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{pendingCount}</strong>
            {' '}unsaved change{pendingCount !== 1 ? 's' : ''} — click Save to apply or Discard to cancel.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn kind="secondary" size="sm" disabled={busy} onClick={() => setPending({})}>
              Discard
            </Btn>
            <Btn kind="primary" size="sm" icon="save" disabled={busy} onClick={saveAll}>
              {busy ? 'Saving…' : 'Save changes'}
            </Btn>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function UsersPage() {
  const orgId = useDefaultOrgId();
  const { mutate } = useSWRConfig();
  const { data: orgs } = useResourceList<Organization>('organizations', { limit: 500 });
  const { data: roles } = useResourceList<Role>('roles', { limit: 500 });
  const { data: allUserRoles, mutate: mutateUserRoles } = useResourceList<UserRole>('user-roles', { limit: 500 });
  const [tab, setTab] = useState('users');
  const [showBothUsers, setShowBothUsers] = useState(false);
  const [showBothRoles, setShowBothRoles] = useState(false);

  const [userModal, setUserModal] = useState<
    | { mode: 'closed' }
    | { mode: 'create' }
    | { mode: 'edit'; user: User }
  >({ mode: 'closed' });

  const refreshUsers = () => mutate((key) => Array.isArray(key) && key[0] === 'list' && key[1] === 'users');

  const orgMap = useMemo(() => new Map(orgs.map((o) => [o.id, o])), [orgs]);

  const findRootOrg = useMemo(() => (orgId: string): Organization | undefined => {
    const visited = new Set<string>();
    let curr = orgMap.get(orgId);
    while (curr) {
      if (visited.has(curr.id)) break;
      visited.add(curr.id);
      const parentId = (curr.settings as Record<string, unknown> | null)?.parent_org_id as string | undefined;
      if (!parentId) return curr;
      curr = orgMap.get(parentId);
    }
    return curr;
  }, [orgMap]);

  const editingUserRoles = userModal.mode === 'edit'
    ? allUserRoles.filter((ur) => ur.user_id === userModal.user.id)
    : [];

  const userCols: Column<User & Record<string, unknown>>[] = useMemo(() => [
    { key: 'name', label: 'Name', render: (u) => <span className="cell-strong">{u.name}</span> },
    { key: 'email', label: 'Email', render: (u) => <span className="mono" style={{ fontSize: 12 }}>{u.email}</span> },
    { key: 'org_id', label: 'Organization', render: (u) => <span>{orgMap.get(u.org_id as string)?.name ?? '—'}</span> },
    { key: '__company', label: 'Company', render: (u) => <span style={{ color: 'var(--text-secondary)' }}>{findRootOrg(u.org_id as string)?.name ?? '—'}</span> },
    { key: 'auth_provider', label: 'Provider', render: (u) => <Tag color="blue" sm>{u.auth_provider ?? 'local'}</Tag> },
    { key: 'is_active', label: 'Status', render: (u) => (u.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="gray" sm>inactive</Tag>) },
  ], [orgMap, findRootOrg]);

  const orgOptions = useMemo(() => buildHierarchicalOrgOptions(orgs), [orgs]);

  const userFields = useMemo<FieldDef[]>(() => [
    { key: 'name', label: 'Name', placeholder: 'Maya Tarigan' },
    { key: 'email', label: 'Email', placeholder: 'maya@pangreksa.io' },
    {
      key: 'org_id',
      label: 'Organization',
      default: orgId ?? '',
      renderField: (value, onChange) => (
        <Select
          value={value}
          onChange={onChange}
          options={[{ value: '', label: '— select organization —' }, ...orgOptions]}
        />
      ),
    },
    { key: 'auth_provider', label: 'Auth provider', type: 'select', options: AUTH_PROVIDERS, default: 'local' },
    { key: 'is_active', label: 'Active', type: 'toggle', default: 'true' },
  ], [orgId, orgOptions]);

  const roleCols: Column<Role & Record<string, unknown>>[] = [
    { key: 'name', label: 'Role', render: (r) => <span className="cell-strong">{r.name}</span> },
    { key: 'description', label: 'Description', render: (r) => <span style={{ color: 'var(--text-secondary)' }}>{r.description ?? '—'}</span> },
    { key: 'scope', label: 'Scope', render: (r) => <Tag color="cyan" sm>{r.scope ?? 'org'}</Tag> },
    { key: 'is_system', label: 'Type', render: (r) => (r.is_system ? <Tag color="purple" sm>system</Tag> : <Tag color="gray" sm>custom</Tag>) },
    { key: 'is_active', label: 'Status', render: (r) => (r.is_active ? <Tag color="green" sm dot>active</Tag> : <Tag color="gray" sm>inactive</Tag>) },
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
            fields={userFields}
            queryParams={showBothUsers ? undefined : { is_active: 'true' }}
            headerActions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>Show:</span>
                <Toggle on={showBothUsers} onChange={setShowBothUsers} label={showBothUsers ? 'Both' : 'Active'} />
              </div>
            }
            onAdd={() => setUserModal({ mode: 'create' })}
            onEdit={(u) => setUserModal({ mode: 'edit', user: u })}
          />
          {userModal.mode !== 'closed' && (
            <UserFormModal
              user={userModal.mode === 'edit' ? userModal.user : undefined}
              orgs={orgs}
              roles={roles}
              existingUserRoles={editingUserRoles}
              onClose={() => setUserModal({ mode: 'closed' })}
              onSaved={() => {
                refreshUsers();
                mutateUserRoles();
              }}
            />
          )}
        </>
      )}
      {tab === 'roles' && (
        <ResourceCrud<Role>
          embedded
          resource="roles"
          title="Roles"
          addLabel="Create role"
          softDelete
          getKey={(r) => r.id}
          searchKeys={['name']}
          createDefaults={orgId ? { org_id: orgId, is_active: true } : { is_active: true }}
          columns={roleCols}
          fields={[
            { key: 'name', label: 'Name', placeholder: 'Gateway Admin' },
            { key: 'description', label: 'Description', type: 'textarea', nullable: true },
            { key: 'scope', label: 'Scope', type: 'select', options: ['org', 'global', 'project'], default: 'org' },
          ]}
          queryParams={showBothRoles ? undefined : { is_active: 'true' }}
          headerActions={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <span>Show:</span>
              <Toggle on={showBothRoles} onChange={setShowBothRoles} label={showBothRoles ? 'Both' : 'Active'} />
            </div>
          }
        />
      )}
      {tab === 'rbac' && <RbacMatrix />}
    </div>
  );
}
