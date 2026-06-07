'use client';

/**
 * Shared screen-level helpers — ported from the design's screens-common.jsx.
 * ChartCard, TimeRange, RankList, StatStrip, Empty, Section, useReorder.
 */

import { useState, type ReactNode, type CSSProperties } from 'react';
import { Icon } from '@/components/Icon';
import { fmtNum, useDrawIn } from '@/components/charts';
import { Tabs } from '@/components/ui';

const I = (n: string, p: { size?: number; style?: CSSProperties } = {}) => <Icon name={n} {...p} />;

export interface LegendItem {
  color: string;
  label: ReactNode;
  dot?: boolean;
}

/** Card wrapper for a chart with title + optional actions/legend. */
export function ChartCard({
  title,
  sub,
  right,
  legend,
  children,
  className = '',
  pad = true,
  info,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  right?: ReactNode;
  legend?: LegendItem[];
  children?: ReactNode;
  className?: string;
  pad?: boolean;
  info?: string;
}) {
  return (
    <div className={`tile ${className}`} style={{ padding: pad ? 16 : 0, display: 'flex', flexDirection: 'column' }}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12, padding: pad ? 0 : '16px 16px 0' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {title}
              {info && (
                <span title={info} style={{ color: 'var(--text-placeholder)', display: 'inline-flex', cursor: 'help' }}>
                  {I('info', { size: 14 })}
                </span>
              )}
            </div>
            {sub && <div style={{ fontSize: 12, color: 'var(--text-helper)', marginTop: 2 }}>{sub}</div>}
          </div>
          {right}
        </div>
      )}
      {legend && (
        <div className="legend" style={{ marginBottom: 10, padding: pad ? 0 : '0 16px' }}>
          {legend.map((l, i) => (
            <span key={i} className="li">
              <span className={`lk ${l.dot ? 'dot' : ''}`} style={{ background: l.color }} />
              {l.label}
            </span>
          ))}
        </div>
      )}
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

/** Time-range contained tabs. */
export function TimeRange({
  value,
  onChange,
  ranges = ['24h', '7d', '30d', '90d'],
}: {
  value: string;
  onChange: (v: string) => void;
  ranges?: string[];
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Tabs contained active={value} onChange={onChange} tabs={ranges.map((r) => ({ id: r, label: r }))} />
      <button className="btn ghost sm btn-icon-only" title="Custom range">
        {I('calendar', { size: 16 })}
      </button>
    </div>
  );
}

export interface RankItem {
  label: ReactNode;
  value: number;
  color?: string;
  mono?: boolean;
  swatch?: boolean;
  [k: string]: unknown;
}

/** Ranked horizontal list with bars. */
export function RankList({
  items,
  valueFormat = fmtNum,
  color,
  max,
  onItem,
}: {
  items: RankItem[];
  valueFormat?: (n: number) => string;
  color?: string;
  max?: number;
  onItem?: (it: RankItem) => void;
}) {
  const mx = max || Math.max(...items.map((i) => i.value), 1);
  const draw = useDrawIn();
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {items.map((it, i) => (
        <div
          key={i}
          onClick={() => onItem && onItem(it)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '9px 0',
            borderBottom: i < items.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            cursor: onItem ? 'pointer' : 'default',
          }}
        >
          <span style={{ width: 18, fontSize: 12, color: 'var(--text-helper)', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
          {it.swatch !== false && (
            <span style={{ width: 8, height: 8, borderRadius: 2, background: it.color || color || 'var(--brand)', flexShrink: 0 }} />
          )}
          <span
            className={it.mono ? 'mono' : ''}
            style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {it.label}
          </span>
          <div style={{ width: '34%', maxWidth: 120 }}>
            <div className="bar-track" style={{ height: 5 }}>
              <div
                className={'bar-fill' + (draw ? ' cx-grow-h' : '')}
                style={{ width: (it.value / mx) * 100 + '%', background: it.color || color || 'var(--brand)', animationDelay: i * 0.05 + 's' }}
              />
            </div>
          </div>
          <span style={{ width: 62, textAlign: 'right', fontSize: 13, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {valueFormat(it.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export interface StatItem {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  icon?: string;
  delta?: ReactNode;
  dir?: 'up' | 'down' | 'flat';
}

/** Stat strip (small inline KPIs). */
export function StatStrip({ stats }: { stats: StatItem[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0, border: '1px solid var(--border-subtle)', background: 'var(--layer-01)' }}>
      {stats.map((s, i) => (
        <div key={i} style={{ flex: '1 1 0', minWidth: 140, padding: '14px 16px', borderRight: i < stats.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {s.icon && I(s.icon, { size: 14, style: { color: 'var(--brand)' } })}
            {s.label}
          </div>
          <div style={{ fontSize: 24, fontWeight: 300, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {s.value}
            {s.unit && <span style={{ fontSize: 13, color: 'var(--text-secondary)', marginLeft: 3 }}>{s.unit}</span>}
          </div>
          {s.delta && (
            <div
              style={{
                fontSize: 11,
                marginTop: 5,
                color: s.dir === 'up' ? 'var(--support-success)' : s.dir === 'down' ? 'var(--support-error)' : 'var(--text-helper)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
              }}
            >
              {s.dir === 'up' ? I('arrowUp', { size: 12 }) : s.dir === 'down' ? I('arrowDown', { size: 12 }) : null}
              {s.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Empty-state placeholder. */
export function Empty({ icon = 'search', title, body, action }: { icon?: string; title?: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="ei">{I(icon, { size: 32 })}</div>
      <div style={{ fontSize: 16, color: 'var(--text-primary)', marginBottom: 4 }}>{title}</div>
      {body && <div style={{ fontSize: 13, maxWidth: '40ch', margin: '0 auto' }}>{body}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

/** Padded section container. */
export function Section({
  title,
  count,
  right,
  children,
  style,
}: {
  title?: ReactNode;
  count?: number;
  right?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div className="section" style={style}>
      {(title || right) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          {title && (
            <div className="section-title">
              {title}
              {count != null && <span className="count">{'(' + count + ')'}</span>}
            </div>
          )}
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/** Drag-to-reorder hook returning [order, handlers(id), draggingId]. */
export function useReorder(
  initial: string[],
): [string[], (id: string) => Record<string, unknown>, string | null] {
  const [order, setOrder] = useState<string[]>(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const handlers = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault();
      if (id !== dragId) setOverId(id);
    },
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDragEnd: () => {
      if (dragId && overId && dragId !== overId) {
        setOrder((o) => {
          const a = [...o];
          const from = a.indexOf(dragId), to = a.indexOf(overId);
          a.splice(from, 1);
          a.splice(to, 0, dragId);
          return a;
        });
      }
      setDragId(null);
      setOverId(null);
    },
    className: (dragId === id ? 'dragging' : '') + (overId === id ? ' drop-target' : ''),
  });
  return [order, handlers, dragId];
}
