'use client';

/**
 * Shared UI primitives — ported from the design's components.jsx.
 * Plain Carbon-styled React components (no component library dependency).
 */

import {
  Fragment,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';
import { Icon } from '@/components/Icon';
import { Sparkline } from '@/components/charts';

/** Small helper mirroring the design's `I(name, props)` shorthand. */
const I = (name: string, props: { size?: number; style?: CSSProperties; className?: string } = {}) => (
  <Icon name={name} {...props} />
);

/* -------- Button -------- */
export type BtnKind = 'primary' | 'secondary' | 'tertiary' | 'ghost' | 'danger' | 'danger-ghost';
export interface BtnProps {
  kind?: BtnKind;
  size?: 'sm' | 'lg';
  icon?: string;
  iconRight?: string;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  disabled?: boolean;
  className?: string;
  title?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit';
}
export function Btn({
  kind = 'primary',
  size,
  icon,
  iconRight,
  children,
  onClick,
  disabled,
  className = '',
  title,
  style,
  type = 'button',
}: BtnProps) {
  const iconOnly = icon && children == null;
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={style}
      className={`btn ${kind} ${size || ''} ${iconOnly ? 'btn-icon-only' : ''} ${className}`}
    >
      {children != null && <span>{children}</span>}
      {icon && !iconRight && <Icon name={icon} className="bi" />}
      {iconRight && <Icon name={iconRight} className="bi" />}
    </button>
  );
}

/* -------- Tag -------- */
export type TagColor = 'blue' | 'cyan' | 'green' | 'purple' | 'red' | 'gray' | 'teal' | 'warm' | 'outline';
export function Tag({
  color = 'gray',
  children,
  dot,
  sm,
  onClose,
  className = '',
  pulse,
}: {
  color?: TagColor;
  children?: ReactNode;
  dot?: boolean | string;
  sm?: boolean;
  onClose?: () => void;
  className?: string;
  pulse?: boolean;
}) {
  return (
    <span className={`tag ${color} ${sm ? 'sm' : ''} ${className}`}>
      {dot && (
        <span
          className={'tdot ' + (pulse ? 'pulse-dot' : '')}
          style={{ background: dot === true ? 'currentColor' : (dot as string) }}
        />
      )}
      {children}
      {onClose && (
        <span className="tclose" onClick={onClose}>
          {I('close', { size: 12 })}
        </span>
      )}
    </span>
  );
}

/* -------- Status pill -------- */
export function Status({ kind = 'ok', children }: { kind?: 'ok' | 'warn' | 'err' | 'idle' | 'info'; children?: ReactNode }) {
  return (
    <span className={`status ${kind}`}>
      <span className="sdot" />
      {children}
    </span>
  );
}

/* -------- Toggle -------- */
export function Toggle({
  on,
  onChange,
  label,
  disabled,
}: {
  on?: boolean;
  onChange?: (v: boolean) => void;
  label?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={`toggle ${on ? 'on' : ''}`}
      onClick={() => !disabled && onChange && onChange(!on)}
      style={{ border: 'none', background: 'none', padding: 0 }}
    >
      <span className="track">
        <span className="knob" />
      </span>
      {label && <span className="tlabel">{label}</span>}
    </button>
  );
}

/* -------- Radio -------- */
export function Radio({ checked, onChange, children }: { checked?: boolean; onChange?: () => void; children?: ReactNode }) {
  return (
    <button
      type="button"
      className={`radio ${checked ? 'on' : ''}`}
      onClick={onChange}
      style={{ border: 'none', background: 'none', padding: 0 }}
    >
      <span className="rc" />
      {children}
    </button>
  );
}

/* -------- Checkbox -------- */
export function Check({
  checked,
  onChange,
  indeterminate,
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  indeterminate?: boolean;
}) {
  return (
    <span
      className={`checkbox ${checked ? 'checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange && onChange(!checked);
      }}
    >
      {checked && I('checkmark', { size: 12 })}
      {indeterminate && !checked && <span style={{ width: 8, height: 2, background: '#fff' }} />}
    </span>
  );
}

/* -------- Field -------- */
export function Field({ label, help, children, error }: { label?: ReactNode; help?: ReactNode; children?: ReactNode; error?: ReactNode }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {error && <span className="field-help" style={{ color: 'var(--support-error)' }}>{error}</span>}
      {help && !error && <span className="field-help">{help}</span>}
    </div>
  );
}

/* -------- Input -------- */
export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  sm,
  mono,
  className = '',
  ...rest
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  type?: string;
  sm?: boolean;
  mono?: boolean;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      className={`inp ${sm ? 'sm' : ''} ${mono ? 'code' : ''} ${className}`}
      onChange={(e) => onChange && onChange(e.target.value)}
      {...rest}
    />
  );
}

/* -------- TextArea -------- */
export function TextArea({
  value,
  onChange,
  placeholder,
  mono,
  rows,
  style,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  rows?: number;
  style?: CSSProperties;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={rows}
      style={style}
      className={`inp ${mono ? 'code' : ''}`}
      onChange={(e) => onChange && onChange(e.target.value)}
    />
  );
}

/* -------- Select -------- */
export type SelectOption = string | { value: string; label: string };
export function Select({
  value,
  onChange,
  options,
  sm,
}: {
  value?: string;
  onChange?: (v: string) => void;
  options: SelectOption[];
  sm?: boolean;
}) {
  return (
    <div className="select">
      <select value={value} onChange={(e) => onChange && onChange(e.target.value)} style={sm ? { height: 32 } : undefined}>
        {options.map((o) => {
          const v = typeof o === 'string' ? o : o.value;
          const l = typeof o === 'string' ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      <span className="chev">{I('chevronDown', { size: 16 })}</span>
    </div>
  );
}

/* -------- SearchBox -------- */
export function SearchBox({
  value,
  onChange,
  placeholder = 'Search',
  style,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  style?: CSSProperties;
}) {
  return (
    <div className="search" style={style}>
      <span className="si">{I('search')}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => onChange && onChange(e.target.value)} />
      {value && (
        <button
          onClick={() => onChange && onChange('')}
          style={{
            position: 'absolute',
            right: 8,
            border: 'none',
            background: 'none',
            color: 'var(--icon-secondary)',
            width: 32,
            height: 32,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {I('close')}
        </button>
      )}
    </div>
  );
}

/* -------- Tabs -------- */
export interface TabDef {
  id: string;
  label: ReactNode;
  icon?: string;
  count?: number;
}
export function Tabs({
  tabs,
  active,
  onChange,
  contained,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
  contained?: boolean;
}) {
  if (contained) {
    return (
      <div className="ctabs">
        {tabs.map((t) => (
          <button key={t.id} className={`ctab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.id} className={`tab ${active === t.id ? 'active' : ''}`} onClick={() => onChange(t.id)}>
          {t.icon && I(t.icon)}
          {t.label}
          {t.count != null && <span className="tcount">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* -------- Overflow menu -------- */
export interface OverflowItem {
  sep?: boolean;
  danger?: boolean;
  icon?: string;
  label?: ReactNode;
  onClick?: () => void;
}
export function OverflowMenu({ items, align = 'right' }: { items: OverflowItem[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className="btn ghost sm btn-icon-only"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {I('overflow')}
      </button>
      {open && (
        <div className="ovm" style={{ [align]: 0, top: '100%', marginTop: 2 } as CSSProperties}>
          {items.map((it, i) =>
            it.sep ? (
              <div key={i} className="ovm-sep" />
            ) : (
              <button
                key={i}
                className={`ovm-item ${it.danger ? 'danger' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick && it.onClick();
                }}
              >
                {it.icon && I(it.icon)}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/* -------- Modal -------- */
export function Modal({
  title,
  label,
  size,
  onClose,
  children,
  footer,
}: {
  title?: ReactNode;
  label?: ReactNode;
  size?: 'sm' | 'lg' | 'xl';
  onClose?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose && onClose();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div
      className="overlay-bg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose && onClose();
      }}
    >
      <div className={`modal ${size || ''}`} role="dialog">
        <div className="modal-head">
          <div className="mh-text">
            {label && <div className="label">{label}</div>}
            <div className="title">{title}</div>
          </div>
          <button className="modal-x" onClick={onClose}>
            {I('close', { size: 20 })}
          </button>
        </div>
        <div className="modal-body scroll">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* -------- Notification -------- */
export type NotifKind = 'info' | 'success' | 'warn' | 'error';
export function Notif({
  kind = 'info',
  title,
  children,
  onClose,
}: {
  kind?: NotifKind;
  title?: ReactNode;
  children?: ReactNode;
  onClose?: () => void;
}) {
  const ic = { info: 'info', success: 'checkmarkFill', warn: 'warningAlt', error: 'error' }[kind];
  const supportColor =
    kind === 'warn' ? 'warning' : kind === 'error' ? 'error' : kind === 'success' ? 'success' : 'info';
  return (
    <div className={`notif ${kind}`}>
      <span style={{ color: `var(--support-${supportColor})`, flexShrink: 0, marginTop: 1 }}>{I(ic)}</span>
      <div style={{ flex: 1 }}>
        {title && <div className="nt-title">{title}</div>}
        {children && <div className="nt-body">{children}</div>}
      </div>
      {onClose && (
        <button onClick={onClose} style={{ border: 'none', background: 'none', color: 'var(--icon-primary)', cursor: 'pointer' }}>
          {I('close')}
        </button>
      )}
    </div>
  );
}

/* -------- Tile -------- */
export function Tile({
  children,
  className = '',
  pad,
  ...rest
}: { children?: ReactNode; className?: string; pad?: 'lg' } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`tile ${pad === 'lg' ? 'pad-lg' : ''} ${className}`} {...rest}>
      {children}
    </div>
  );
}

/* -------- KPI tile -------- */
export function Kpi({
  label,
  value,
  unit,
  delta,
  deltaDir,
  spark,
  sparkColor = 'var(--brand)',
  foot,
  icon,
  draggable,
  dragHandlers,
}: {
  label?: ReactNode;
  value?: ReactNode;
  unit?: ReactNode;
  delta?: ReactNode;
  deltaDir?: 'up' | 'down' | 'flat';
  spark?: number[];
  sparkColor?: string;
  foot?: ReactNode;
  icon?: string;
  draggable?: boolean;
  dragHandlers?: Record<string, unknown>;
}) {
  return (
    <div className="tile kpi" draggable={draggable} {...(dragHandlers || {})}>
      <div className="kpi-head">
        <span className="kpi-label">
          {icon && I(icon, { size: 16, style: { color: 'var(--brand)' } })}
          {label}
        </span>
        {draggable !== undefined && <span className="drag-handle">{I('grip', { size: 16 })}</span>}
      </div>
      <div className="kpi-val">
        {value}
        {unit && <span className="unit">{unit}</span>}
      </div>
      {delta != null && (
        <div className={`kpi-delta ${deltaDir || 'flat'}`}>
          {deltaDir === 'up' ? I('arrowUp', { size: 14 }) : deltaDir === 'down' ? I('arrowDown', { size: 14 }) : null}
          {delta}
        </div>
      )}
      {spark && (
        <div className="kpi-spark">
          <Sparkline data={spark} width={240} height={40} color={sparkColor} fluid />
        </div>
      )}
      {foot && <div className="kpi-foot">{foot}</div>}
    </div>
  );
}

/* -------- Pagination -------- */
export function Pagination({
  page,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizes = [10, 25, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize?: (s: number) => void;
  pageSizes?: number[];
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="pagination">
      <div className="pg-left">
        <div className="pg-sel">
          <span>Items per page:</span>
          <div className="select" style={{ width: 72 }}>
            <select value={pageSize} onChange={(e) => onPageSize && onPageSize(+e.target.value)} style={{ height: 32, paddingLeft: 12 }}>
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <span className="chev">{I('chevronDown')}</span>
          </div>
        </div>
        <span style={{ padding: '0 16px' }}>{`${from}–${to} of ${total} items`}</span>
      </div>
      <div className="pg-right">
        <span style={{ padding: '0 16px' }}>{`${page} of ${pages} pages`}</span>
        <div className="pg-nav">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)}>
            {I('chevronLeft')}
          </button>
          <button disabled={page >= pages} onClick={() => onPage(page + 1)}>
            {I('chevronRight')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------- DataTable -------- */
export interface Column<T> {
  key: string;
  label: ReactNode;
  width?: number | string;
  align?: 'left' | 'right';
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  mono?: boolean;
}
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  getKey,
  renderExpand,
  compact,
  selectable,
  selected,
  onSelect,
  sortable = true,
  sortKey,
  sortDir,
  onSort,
  rowActions,
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (r: T) => string;
  renderExpand?: (r: T) => ReactNode;
  compact?: boolean;
  selectable?: boolean;
  selected?: Record<string, boolean>;
  onSelect?: (key: string, val?: boolean) => void;
  sortable?: boolean;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  rowActions?: (r: T) => ReactNode;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const allSel = !!selectable && rows.length > 0 && rows.every((r) => selected && selected[getKey(r)]);
  const colSpan = columns.length + 1 + (selectable ? 1 : 0) + (rowActions ? 1 : 0);
  return (
    <table className={`dt ${compact ? 'compact' : ''}`}>
      <thead>
        <tr>
          {renderExpand && <th className="expand-cell" />}
          {selectable && (
            <th style={{ width: 40 }}>
              <Check checked={allSel} onChange={() => onSelect && onSelect('all', !allSel)} />
            </th>
          )}
          {columns.map((c) => (
            <th
              key={c.key}
              className={`${c.sortable !== false && sortable ? 'sortable' : ''} ${sortKey === c.key ? 'sorted' : ''}`}
              style={{ width: c.width, textAlign: c.align || 'left' }}
              onClick={() => c.sortable !== false && sortable && onSort && onSort(c.key)}
            >
              <span className="th-in" style={{ justifyContent: c.align === 'right' ? 'flex-end' : 'flex-start' }}>
                {c.label}
                {c.sortable !== false && sortable && (
                  <span className="sort-i">{I(sortKey === c.key && sortDir === 'asc' ? 'arrowUp' : 'arrowDown', { size: 14 })}</span>
                )}
              </span>
            </th>
          ))}
          {rowActions && <th style={{ width: 96 }} />}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const k = getKey(r);
          const isExp = expanded[k];
          return (
            <Fragment key={k}>
              <tr
                className={`row ${renderExpand ? 'expandable' : ''}`}
                onClick={() => renderExpand && setExpanded((s) => ({ ...s, [k]: !s[k] }))}
              >
                {renderExpand && (
                  <td className="expand-cell">
                    <span
                      style={{
                        transition: 'transform .15s',
                        display: 'inline-flex',
                        transform: isExp ? 'rotate(90deg)' : 'none',
                        color: 'var(--icon-primary)',
                      }}
                    >
                      {I('chevronRight')}
                    </span>
                  </td>
                )}
                {selectable && (
                  <td onClick={(e) => e.stopPropagation()} style={{ width: 40 }}>
                    <Check checked={!!(selected && selected[k])} onChange={() => onSelect && onSelect(k)} />
                  </td>
                )}
                {columns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.align || 'left' }} className={c.mono ? 'mono' : ''}>
                    {c.render ? c.render(r) : (r[c.key] as ReactNode)}
                  </td>
                ))}
                {rowActions && (
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="row-actions">{rowActions(r)}</div>
                  </td>
                )}
              </tr>
              {renderExpand && isExp && (
                <tr className="expand-row">
                  <td colSpan={colSpan}>
                    <div className="expand-inner fade-in">{renderExpand(r)}</div>
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/* -------- Table toolbar -------- */
export function TableToolbar({
  search,
  onSearch,
  children,
  searchPlaceholder,
}: {
  search?: string;
  onSearch?: (v: string) => void;
  children?: ReactNode;
  searchPlaceholder?: string;
}) {
  return (
    <div className="dt-toolbar">
      <div className="search">
        <span className="si">{I('search')}</span>
        <input value={search} placeholder={searchPlaceholder || 'Search'} onChange={(e) => onSearch && onSearch(e.target.value)} />
      </div>
      <div className="tb-actions">{children}</div>
    </div>
  );
}

/* -------- KV row -------- */
export function KV({ k, v, mono }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{v}</span>
    </div>
  );
}

/* -------- Page header -------- */
export interface Crumb {
  label: ReactNode;
  href?: boolean;
  onClick?: () => void;
}
export function PageHead({
  crumbs,
  title,
  sub,
  actions,
}: {
  crumbs?: Crumb[];
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-head">
      {crumbs && (
        <div className="breadcrumb">
          {crumbs.map((c, i) => (
            <Fragment key={i}>
              {i > 0 && <span className="sep">/</span>}
              {c.href ? (
                <a
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    c.onClick && c.onClick();
                  }}
                >
                  {c.label}
                </a>
              ) : (
                <span>{c.label}</span>
              )}
            </Fragment>
          ))}
        </div>
      )}
      <div className="page-head-row">
        <div>
          <h1 className="page-title">{title}</h1>
          {sub && <p className="page-sub">{sub}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </div>
    </div>
  );
}

/* -------- Toast host hook -------- */
export interface ToastInput {
  kind?: NotifKind;
  title?: ReactNode;
  body?: ReactNode;
  duration?: number;
}
interface ToastItem extends ToastInput {
  id: string;
}
export function useToasts(): [(t: ToastInput) => void, ReactNode] {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((t: ToastInput) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((s) => [...s, { ...t, id }]);
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), t.duration || 3500);
  }, []);
  const host = (
    <div className="toast-wrap">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Notif kind={t.kind || 'success'} title={t.title} onClose={() => setToasts((s) => s.filter((x) => x.id !== t.id))}>
            {t.body}
          </Notif>
        </div>
      ))}
    </div>
  );
  return [push, host];
}
