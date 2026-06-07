'use client';

/**
 * Administration → Organization. Native SVG org-chart over the REAL
 * `organizations` resource. Hierarchy is derived from `settings.parent_org_id`
 * (no parent_id column exists). Supports pan/zoom, select, and full CRUD
 * (add / edit / delete) through the BFF.
 */

import { useMemo, useRef, useState } from 'react';
import { PageHead, Btn, Tag, Modal, Field, Input, Select, Notif } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList } from '@/lib/hooks';
import { createResource, updateResource, deleteResource, ApiError } from '@/lib/api/resources';
import type { Organization } from '@/lib/types';

interface TreeNode {
  org: Organization;
  children: TreeNode[];
  x: number;
  y: number;
  depth: number;
}

const NODE_W = 188;
const NODE_H = 64;
const GAP_X = 28;
const GAP_Y = 72;
const LEVEL_COLOR = ['#0f62fe', '#1192e8', '#009d9a', '#6929c4', '#ee538b'];

/** Reads the parent id stored in settings JSONB. */
function parentOf(o: Organization): string | null {
  const p = (o.settings as { parent_org_id?: string } | null)?.parent_org_id;
  return p ?? null;
}

/** Builds parent→child trees and assigns x/y via a simple tidy layout. */
function buildLayout(orgs: Organization[]): { roots: TreeNode[]; width: number; height: number } {
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const nodes = new Map<string, TreeNode>(orgs.map((o) => [o.id, { org: o, children: [], x: 0, y: 0, depth: 0 }]));
  const roots: TreeNode[] = [];
  for (const o of orgs) {
    const pid = parentOf(o);
    const node = nodes.get(o.id)!;
    if (pid && byId.has(pid) && pid !== o.id) nodes.get(pid)!.children.push(node);
    else roots.push(node);
  }

  let cursorX = 0;
  let maxDepth = 0;
  const place = (n: TreeNode, depth: number): number => {
    n.depth = depth;
    maxDepth = Math.max(maxDepth, depth);
    if (n.children.length === 0) {
      n.x = cursorX;
      cursorX += NODE_W + GAP_X;
    } else {
      const xs = n.children.map((c) => place(c, depth + 1));
      n.x = (Math.min(...xs) + Math.max(...xs)) / 2;
    }
    n.y = depth * (NODE_H + GAP_Y);
    return n.x;
  };
  roots.forEach((r) => {
    place(r, 0);
    cursorX += GAP_X;
  });
  return { roots, width: Math.max(cursorX, 400), height: (maxDepth + 1) * (NODE_H + GAP_Y) };
}

function flatten(roots: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (n: TreeNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}

const TIERS = ['enterprise', 'business', 'team', 'free'];
const emptyForm = { name: '', slug: '', tier: 'business', billing_email: '', parent_org_id: '' };

export default function OrgPage() {
  const { data: orgs, isLoading, mutate } = useResourceList<Organization>('organizations', { limit: 500 });
  const { roots, width, height } = useMemo(() => buildLayout(orgs), [orgs]);
  const nodes = useMemo(() => flatten(roots), [roots]);

  const [selId, setSelId] = useState<string | null>(null);
  const [pan, setPan] = useState({ x: 40, y: 24 });
  const [zoom, setZoom] = useState(0.9);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [panning, setPanning] = useState(false);

  const [modal, setModal] = useState<null | 'add' | 'edit'>(null);
  const [form, setForm] = useState(emptyForm);
  const [editId, setEditId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);

  const selected = orgs.find((o) => o.id === selId) ?? null;

  const openAdd = (parentId?: string) => {
    setForm({ ...emptyForm, parent_org_id: parentId ?? '' });
    setErr(null);
    setEditId(null);
    setModal('add');
  };
  const openEdit = (o: Organization) => {
    setForm({ name: o.name, slug: o.slug, tier: o.tier ?? 'business', billing_email: o.billing_email ?? '', parent_org_id: parentOf(o) ?? '' });
    setErr(null);
    setEditId(o.id);
    setModal('edit');
  };

  async function save() {
    setBusy(true);
    setErr(null);
    const settings: Record<string, unknown> = form.parent_org_id ? { parent_org_id: form.parent_org_id } : {};
    const payload = {
      name: form.name,
      slug: form.slug,
      tier: form.tier,
      billing_email: form.billing_email || null,
      settings,
    };
    try {
      if (editId) await updateResource('organizations', editId, payload);
      else await createResource('organizations', payload);
      setModal(null);
      mutate();
    } catch (e) {
      const ae = e as ApiError;
      setErr({ field: ae.field, msg: ae.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(o: Organization) {
    if (!confirm(`Delete organization "${o.name}"? Child orgs will be re-parented to root.`)) return;
    try {
      await deleteResource('organizations', o.id);
      setSelId(null);
      mutate();
    } catch (e) {
      alert((e as ApiError).message);
    }
  }

  return (
    <div>
      <PageHead
        title="Organization"
        sub="Visual org hierarchy across organizations, divisions, departments and units. Hierarchy is stored in settings.parent_org_id."
        actions={
          <>
            <Btn kind="tertiary" size="sm" icon="cloud">Import from Entra ID</Btn>
            <Btn kind="primary" size="sm" icon="add" onClick={() => openAdd()}>Add organization</Btn>
          </>
        }
      />

      <Section style={{ paddingTop: 20 }}>
        <div
          className={`org-canvas ${panning ? 'panning' : ''}`}
          onMouseDown={(e) => {
            dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
            setPanning(true);
          }}
          onMouseMove={(e) => {
            if (!dragRef.current) return;
            setPan({ x: dragRef.current.px + (e.clientX - dragRef.current.x), y: dragRef.current.py + (e.clientY - dragRef.current.y) });
          }}
          onMouseUp={() => {
            dragRef.current = null;
            setPanning(false);
          }}
          onMouseLeave={() => {
            dragRef.current = null;
            setPanning(false);
          }}
          onWheel={(e) => setZoom((z) => Math.max(0.4, Math.min(1.8, z - e.deltaY * 0.001)))}
        >
          {isLoading && <div className="empty" style={{ paddingTop: 80 }}>Loading organizations…</div>}
          {!isLoading && nodes.length === 0 && <div className="empty" style={{ paddingTop: 80 }}>No organizations yet. Add one to start the hierarchy.</div>}
          <div className="org-stage" style={{ transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})` }}>
            <svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
              {nodes.flatMap((n) =>
                n.children.map((c) => {
                  const x1 = n.x + NODE_W / 2, y1 = n.y + NODE_H;
                  const x2 = c.x + NODE_W / 2, y2 = c.y;
                  const my = (y1 + y2) / 2;
                  return <path key={n.org.id + c.org.id} d={`M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke="var(--border-subtle-2)" strokeWidth={1.5} />;
                }),
              )}
            </svg>
            {nodes.map((n) => (
              <div
                key={n.org.id}
                className={`org-node ${selId === n.org.id ? 'selected' : ''}`}
                style={{ left: n.x, top: n.y, position: 'absolute' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelId(n.org.id);
                }}
              >
                <div className="on-bar" style={{ background: LEVEL_COLOR[n.depth % LEVEL_COLOR.length] }} />
                <div className="on-body">
                  <div className="on-title">{n.org.name}</div>
                  <div className="on-sub">
                    <Tag color="gray" sm>{n.org.tier ?? 'org'}</Tag>
                    {n.org.slug}
                  </div>
                </div>
                <div className="org-add" title="Add child" onClick={(e) => { e.stopPropagation(); openAdd(n.org.id); }}>
                  <Icon name="add" size={12} />
                </div>
              </div>
            ))}
          </div>
          <div className="org-zoom">
            <button onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))}><Icon name="add" size={16} /></button>
            <button onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}><Icon name="chevronDown" size={16} /></button>
          </div>
          {selected && (
            <div className="org-mini" style={{ minWidth: 220 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{selected.name}</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                <Tag color="blue" sm>{selected.tier ?? 'org'}</Tag>
                {selected.is_active ? <Tag color="green" sm>active</Tag> : <Tag color="gray" sm>inactive</Tag>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <Btn kind="tertiary" size="sm" icon="edit" onClick={() => openEdit(selected)}>Edit</Btn>
                <Btn kind="tertiary" size="sm" icon="add" onClick={() => openAdd(selected.id)}>Child</Btn>
                <Btn kind="danger-ghost" size="sm" icon="trash" onClick={() => remove(selected)} />
              </div>
            </div>
          )}
        </div>
      </Section>

      {modal && (
        <Modal
          title={editId ? 'Edit organization' : 'Add organization'}
          label="Organizations"
          onClose={() => setModal(null)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setModal(null)}>Cancel</Btn>
              <Btn kind="primary" iconRight="arrowRight" onClick={save} disabled={busy || !form.name.trim() || !form.slug.trim()}>
                {busy ? 'Saving…' : editId ? 'Save changes' : 'Create'}
              </Btn>
            </>
          }
        >
          {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not save">{err.msg}</Notif></div>}
          <Field label="Name" error={err?.field === 'name' ? err.msg : undefined}>
            <Input value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="Acme Engineering" />
          </Field>
          <Field label="Slug" help="lowercase, dashes" error={err?.field === 'slug' ? err.msg : undefined}>
            <Input value={form.slug} onChange={(v) => setForm((f) => ({ ...f, slug: v }))} placeholder="acme-eng" mono />
          </Field>
          <Field label="Tier">
            <Select value={form.tier} onChange={(v) => setForm((f) => ({ ...f, tier: v }))} options={TIERS} />
          </Field>
          <Field label="Billing email" error={err?.field === 'billing_email' ? err.msg : undefined}>
            <Input value={form.billing_email} onChange={(v) => setForm((f) => ({ ...f, billing_email: v }))} placeholder="billing@acme.io" />
          </Field>
          <Field label="Parent organization" help="Leave blank for a top-level org">
            <Select
              value={form.parent_org_id}
              onChange={(v) => setForm((f) => ({ ...f, parent_org_id: v }))}
              options={[{ value: '', label: '— none (root) —' }, ...orgs.filter((o) => o.id !== editId).map((o) => ({ value: o.id, label: o.name }))]}
            />
          </Field>
        </Modal>
      )}
    </div>
  );
}
