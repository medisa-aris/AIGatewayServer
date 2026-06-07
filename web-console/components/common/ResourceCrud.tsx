'use client';

/**
 * Reusable resource CRUD scaffold.
 *
 * Renders a live table of any central-server resource (via the BFF) plus an
 * add/edit modal and delete action. Field definitions drive the form and a
 * lightweight client-side validation pass; the BFF re-validates on submit and
 * returns `{error, field}` which is surfaced inline. Handles the NUMERIC-as-
 * string and nullable-field coercions when building the payload.
 */

import { useMemo, useState, type ReactNode } from 'react';
import {
  PageHead,
  Btn,
  Modal,
  Field,
  Input,
  TextArea,
  Select,
  Toggle,
  Notif,
  DataTable,
  Pagination,
  SearchBox,
  type Column,
} from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { useResourceList } from '@/lib/hooks';
import { createResource, updateResource, deleteResource, ApiError } from '@/lib/api/resources';
import { validate } from '@/lib/validation';

export interface FieldDef {
  key: string;
  label: string | ((form: Record<string, string>) => string);
  type?: 'text' | 'number' | 'select' | 'textarea' | 'toggle';
  options?: { value: string; label: string }[] | string[];
  help?: string;
  placeholder?: string;
  /** Nullable DB column → empty string becomes null in the payload. */
  nullable?: boolean;
  /** Only show / include this field when the predicate passes. */
  showIf?: (form: Record<string, string>) => boolean;
  /** Default value when adding. */
  default?: string;
  mono?: boolean;
  /** Custom render — replaces the standard input widget when provided. */
  renderField?: (value: string, onChange: (v: string) => void, form: Record<string, string>) => ReactNode;
}

export interface ResourceCrudProps<T> {
  resource: string;
  title: string;
  sub?: string;
  columns: Column<T & Record<string, unknown>>[];
  fields: FieldDef[];
  getKey: (row: T) => string;
  /** Columns/keys to match against the search box. */
  searchKeys?: (keyof T)[];
  /** Soft delete (PATCH is_active:false) instead of hard DELETE. */
  softDelete?: boolean;
  addLabel?: string;
  headerActions?: ReactNode;
  /** Extra payload merged into every create (e.g. org_id). */
  createDefaults?: Record<string, unknown>;
  renderExpand?: (row: T) => ReactNode;
  fallback?: T[];
  /** Hide the PageHead (for embedding inside a tabbed screen). */
  embedded?: boolean;
  /** If provided, replaces the built-in add modal. */
  onAdd?: () => void;
  /** If provided, replaces the built-in edit modal. */
  onEdit?: (row: T) => void;
  /** Extra query params forwarded to the list request (e.g. { is_active: 'true' }). */
  queryParams?: Record<string, string | number | undefined>;
}

export function ResourceCrud<T extends { id: string }>({
  resource,
  title,
  sub,
  columns,
  fields,
  getKey,
  searchKeys = [],
  softDelete = false,
  addLabel = 'Add',
  headerActions,
  createDefaults = {},
  renderExpand,
  fallback,
  embedded = false,
  onAdd,
  onEdit,
  queryParams,
}: ResourceCrudProps<T>) {
  const { data: rows, isLoading, mutate } = useResourceList<T>(resource, { limit: 500, ...queryParams }, fallback);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ field?: string; msg: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle)));
  }, [rows, q, searchKeys]);
  const total = filtered.length;
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function openAdd() {
    const init: Record<string, string> = {};
    fields.forEach((f) => (init[f.key] = f.default ?? ''));
    setForm(init);
    setEditId(null);
    setErr(null);
    setModal(true);
  }
  function openEdit(row: T) {
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      const v = (row as Record<string, unknown>)[f.key];
      init[f.key] = v == null ? '' : String(v);
    });
    setForm(init);
    setEditId(row.id);
    setErr(null);
    setModal(true);
  }

  function buildPayload(): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(editId ? {} : createDefaults) };
    for (const f of fields) {
      if (f.showIf && !f.showIf(form)) continue;
      const raw = form[f.key] ?? '';
      if (f.type === 'number') out[f.key] = raw === '' ? (f.nullable ? null : 0) : Number(raw);
      else if (f.type === 'toggle') out[f.key] = raw === 'true';
      else out[f.key] = raw === '' ? (f.nullable ? null : '') : raw;
    }
    return out;
  }

  async function save() {
    const payload = buildPayload();
    // Client-side pre-validation (BFF re-validates).
    const v = validate(resource, payload as Record<string, unknown>, !!editId);
    if (v) {
      setErr({ field: v.field, msg: v.error });
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      if (editId) await updateResource(resource, editId, payload);
      else await createResource(resource, payload);
      setModal(false);
      mutate();
    } catch (e) {
      const ae = e as ApiError;
      setErr({ field: ae.field, msg: ae.message });
    } finally {
      setBusy(false);
    }
  }

  function remove(row: T) {
    setDeleteTarget(row);
    setDeleteErr(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    setDeleteErr(null);
    try {
      if (softDelete) await updateResource(resource, deleteTarget.id, { is_active: false });
      else await deleteResource(resource, deleteTarget.id);
      setDeleteTarget(null);
      mutate();
    } catch (e) {
      setDeleteErr((e as ApiError).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  const allColumns: Column<T & Record<string, unknown>>[] = [
    ...columns,
    {
      key: '__actions',
      label: '',
      width: 96,
      sortable: false,
      render: (row) => (
        <div style={{ display: 'flex', gap: 2 }}>
          <Btn kind="ghost" size="sm" icon="edit" title="Edit" onClick={() => onEdit ? onEdit(row as T) : openEdit(row as T)} />
          <Btn kind="danger-ghost" size="sm" icon="trash" title={softDelete ? 'Deactivate' : 'Delete'} onClick={() => remove(row as T)} />
        </div>
      ),
    },
  ];

  return (
    <div>
      {embedded ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '16px 32px 0' }}>
          {headerActions}
          <Btn kind="primary" size="sm" icon="add" onClick={onAdd ?? openAdd}>{addLabel}</Btn>
        </div>
      ) : (
        <PageHead title={title} sub={sub} actions={<>{headerActions}<Btn kind="primary" size="sm" icon="add" onClick={onAdd ?? openAdd}>{addLabel}</Btn></>} />
      )}
      <Section style={{ paddingTop: embedded ? 12 : 20 }}>
        {searchKeys.length > 0 && (
          <div style={{ width: 320, marginBottom: 14 }}>
            <SearchBox value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search…" />
          </div>
        )}
        <div className="dt-wrap">
          {isLoading ? (
            <div className="empty" style={{ padding: 48 }}>Loading…</div>
          ) : (
            <>
              <DataTable
                columns={allColumns}
                rows={pageRows as (T & Record<string, unknown>)[]}
                getKey={(r) => getKey(r as T)}
                renderExpand={renderExpand ? (r) => renderExpand(r as T) : undefined}
                sortable={false}
              />
              {total > pageSize && <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }} />}
            </>
          )}
        </div>
      </Section>

      {deleteTarget && (
        <Modal
          title={softDelete ? 'Deactivate' : 'Delete'}
          label="Confirm delete"
          onClose={() => { setDeleteTarget(null); setDeleteErr(null); }}
          footer={
            <>
              <Btn kind="secondary" onClick={() => { setDeleteTarget(null); setDeleteErr(null); }}>Cancel</Btn>
              <Btn kind="danger" onClick={confirmDelete} disabled={deleteBusy}>
                {deleteBusy ? (softDelete ? 'Deactivating…' : 'Deleting…') : (softDelete ? 'Deactivate' : 'Delete')}
              </Btn>
            </>
          }
        >
          {deleteErr && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Error">{deleteErr}</Notif></div>}
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>
            {softDelete ? 'Deactivate' : 'Delete'}{' '}
            <strong>&ldquo;{String((deleteTarget as Record<string, unknown>).name ?? deleteTarget.id)}&rdquo;</strong>?
            {!softDelete && <><br /><span style={{ color: 'var(--text-helper)', fontSize: 13 }}>This action cannot be undone.</span></>}
          </p>
        </Modal>
      )}

      {modal && (
        <Modal
          title={editId ? `Edit ${title.replace(/s$/, '')}` : `New ${title.replace(/s$/, '')}`}
          label={title}
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn kind="primary" iconRight="arrowRight" onClick={save} disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : 'Create'}</Btn>
            </>
          }
        >
          {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not save">{err.msg}</Notif></div>}
          {fields.map((f) => {
            if (f.showIf && !f.showIf(form)) return null;
            const val = form[f.key] ?? '';
            const error = err?.field === f.key ? err.msg : undefined;
            const set = (v: string) => setForm((s) => ({ ...s, [f.key]: v }));
            const custom = f.renderField?.(val, set, form);
            if (custom === null) return null;
            return (
              <Field key={f.key} label={typeof f.label === 'function' ? f.label(form) : f.label} help={f.help} error={error}>
                {custom ?? (f.type === 'select' ? (
                  <Select value={val} onChange={set} options={(f.options ?? []) as never} />
                ) : f.type === 'textarea' ? (
                  <TextArea value={val} onChange={set} placeholder={f.placeholder} mono={f.mono} rows={5} />
                ) : f.type === 'toggle' ? (
                  <Toggle on={val === 'true'} onChange={(b) => set(String(b))} label={val === 'true' ? 'Enabled' : 'Disabled'} />
                ) : (
                  <Input value={val} onChange={set} placeholder={f.placeholder} mono={f.mono} type={f.type === 'number' ? 'number' : 'text'} />
                ))}
              </Field>
            );
          })}
        </Modal>
      )}
    </div>
  );
}
