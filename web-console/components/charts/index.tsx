'use client';

/**
 * SVG chart library — ported from the design's charts.jsx.
 * Dependency-free, interactive (hover tooltips, drag-to-brush), and animated.
 *
 * Animation technique: each chart's resting style is the fully-visible
 * end-state. The draw-in class is added on mount and removed via a guaranteed
 * setTimeout, so a throttled/backgrounded tab can never freeze a chart at the
 * hidden 0% keyframe.
 */

import {
  useId,
  useState,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
  type CSSProperties,
} from 'react';

export const DV_PALETTE = [
  '#1192e8', '#0f62fe', '#6929c4', '#009d9a', '#ee538b',
  '#a56eff', '#005d5d', '#fa4d56', '#b28600', '#012749',
];
const DV = DV_PALETTE;
const col = (colors: string[], i: number) => colors[i % colors.length] ?? '#1192e8';

/* ---- entrance/draw-in hooks ---- */
export function useEntrance(dep?: unknown): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(false);
    const t = setTimeout(() => setOn(true), 60);
    return () => clearTimeout(t);
  }, [dep]);
  return on;
}
export function useDrawIn(enabled = true, ms = 1700): boolean {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    if (!enabled) {
      setOn(false);
      return;
    }
    setOn(true);
    const to = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(to);
  }, [enabled]);
  return on;
}

/**
 * True only after the first client mount. Charts gate their SVG on this so the
 * server render (a sized placeholder) matches the first client render, avoiding
 * hydration mismatches from trig floating-point drift and animated ids.
 */
function useMounted(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function useMeasure(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((es) => {
      for (const e of es) setW(e.contentRect.width);
    });
    ro.observe(ref.current);
    setW(ref.current.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/* ---- number formatting ---- */
export function fmtNum(n: number | null | undefined): string {
  if (n == null) return '–';
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  if (a < 1 && a > 0) return n.toFixed(2);
  return String(Math.round(n * 100) / 100);
}
export function usd(n: number | null | undefined): string {
  return '$' + fmtNum(n);
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

/* ---- seeded RNG (for LiveLine initial buffer) ---- */
function mulberry(seed: number): () => number {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function genSeries(seed: number, n: number, base: number, vol: number, trend = 0, floor = 0): number[] {
  const r = mulberry(seed);
  const out: number[] = [];
  let v = base;
  for (let i = 0; i < n; i++) {
    v += (r() - 0.5) * vol + trend;
    if (v < floor) v = floor;
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}

/* ---- shared types ---- */
export interface ChartSeries {
  name: string;
  data: (number | null)[];
}
export interface CategoryPoint {
  label: string;
  value: number;
  color?: string;
}
interface TipRow {
  color?: string;
  label: ReactNode;
  value: ReactNode;
}
interface TipState {
  x: number;
  y: number;
  title?: ReactNode;
  rows?: TipRow[];
}

/* ---- shared tooltip overlay ---- */
function Tip({ tip }: { tip: TipState | null }) {
  if (!tip) return null;
  return (
    <div className="ctip" style={{ left: tip.x + 12, top: tip.y - 8 }}>
      {tip.title && <div style={{ fontWeight: 600, marginBottom: tip.rows ? 4 : 0 }}>{tip.title}</div>}
      {(tip.rows || []).map((r, i) => (
        <div key={i} className="tt-row">
          <span className="tt-k">
            {r.color && <span className="tt-dot" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="mono" style={{ fontWeight: 600, marginLeft: 14 }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Line / Area chart ---------------- */
export interface LineChartProps {
  series?: ChartSeries[];
  labels?: string[];
  height?: number;
  area?: boolean;
  smooth?: boolean;
  yFormat?: (n: number | null | undefined) => string;
  colors?: string[];
  showGrid?: boolean;
  onBrush?: (range: [number, number]) => void;
  brushable?: boolean;
  yMaxOverride?: number;
  animate?: boolean;
}
export function LineChart({
  series = [],
  labels = [],
  height = 240,
  area = false,
  smooth = true,
  yFormat = fmtNum,
  colors = DV,
  showGrid = true,
  onBrush,
  brushable = false,
  yMaxOverride,
  animate = true,
}: LineChartProps) {
  const mounted = useMounted();
  const [ref, w] = useMeasure();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hoverI, setHoverI] = useState<number | null>(null);
  const [brush, setBrush] = useState<{ x0: number; x1: number } | null>(null);
  const draw = useDrawIn(animate);
  const dragRef = useRef<number | null>(null);
  const padL = 44, padR = 12, padT = 12, padB = 24;
  const innerW = Math.max(10, w - padL - padR), innerH = height - padT - padB;
  const n = labels.length || series[0]?.data.length || 0;
  const allVals = series.flatMap((s) => s.data).filter((v): v is number => v != null);
  const yMax = yMaxOverride != null ? yMaxOverride : niceMax(Math.max(1, ...allVals));
  const yMin = 0;
  const xAt = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => padT + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  const path = (data: (number | null)[], close: boolean) => {
    let d = '';
    data.forEach((v, i) => {
      if (v == null) return;
      const x = xAt(i), y = yAt(v);
      if (d === '') {
        d = `M${x},${y}`;
      } else if (smooth) {
        const px = xAt(i - 1), py = yAt(data[i - 1] ?? v);
        const cx = (px + x) / 2;
        d += ` C${cx},${py} ${cx},${y} ${x},${y}`;
      } else d += ` L${x},${y}`;
    });
    if (close && d) {
      d += ` L${xAt(data.length - 1)},${yAt(0)} L${xAt(0)},${yAt(0)} Z`;
    }
    return d;
  };

  const gridY = 4;
  const onMove = useCallback(
    (e: React.MouseEvent) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      let i = Math.round(((mx - padL) / innerW) * (n - 1));
      i = Math.max(0, Math.min(n - 1, i));
      setHoverI(i);
      setTip({
        x: e.clientX,
        y: e.clientY,
        title: labels[i] ?? '#' + i,
        rows: series.map((s, si) => ({ color: col(colors, si), label: s.name, value: yFormat(s.data[i]) })),
      });
      if (dragRef.current != null) setBrush({ x0: dragRef.current, x1: mx });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [w, n, series],
  );

  if (!mounted) return <div ref={ref} style={{ width: '100%', height }} />;

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg
        width="100%"
        height={height}
        className={draw ? 'cx-fade' : ''}
        style={{ display: 'block', cursor: brushable ? 'crosshair' : 'default' }}
        onMouseLeave={() => {
          setTip(null);
          setHoverI(null);
          if (!dragRef.current) setBrush(null);
        }}
        onMouseMove={onMove}
        onMouseDown={
          brushable
            ? (e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                dragRef.current = e.clientX - rect.left;
                setBrush({ x0: dragRef.current, x1: dragRef.current });
              }
            : undefined
        }
        onMouseUp={
          brushable
            ? () => {
                if (brush && Math.abs(brush.x1 - brush.x0) > 8 && onBrush) {
                  const a = Math.min(brush.x0, brush.x1), b = Math.max(brush.x0, brush.x1);
                  const i0 = Math.max(0, Math.round(((a - padL) / innerW) * (n - 1)));
                  const i1 = Math.min(n - 1, Math.round(((b - padL) / innerW) * (n - 1)));
                  onBrush([i0, i1]);
                }
                dragRef.current = null;
                setTimeout(() => setBrush(null), 600);
              }
            : undefined
        }
      >
        {showGrid &&
          Array.from({ length: gridY + 1 }).map((_, gi) => {
            const yy = padT + (gi / gridY) * innerH;
            const val = yMax - (gi / gridY) * (yMax - yMin);
            return (
              <g key={gi}>
                <line x1={padL} x2={padL + innerW} y1={yy} y2={yy} stroke="var(--grid-line)" strokeWidth={1} />
                <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="var(--text-helper)">
                  {yFormat(val)}
                </text>
              </g>
            );
          })}
        {labels.map((l, i) => {
          const every = Math.ceil(n / 8);
          if (i % every !== 0 && i !== n - 1) return null;
          return (
            <text key={i} x={xAt(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--text-helper)">
              {l}
            </text>
          );
        })}
        {area &&
          series.map((s, si) => (
            <path key={'a' + si} d={path(s.data, true)} fill={col(colors, si)} opacity={series.length > 1 ? 0.12 : 0.16} />
          ))}
        {series.map((s, si) => (
          <path
            key={'l' + si}
            d={path(s.data, false)}
            fill="none"
            stroke={col(colors, si)}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={draw ? 1 : undefined}
            className={draw ? 'cx-line' : ''}
            style={draw ? { animationDelay: 0.15 + si * 0.12 + 's' } : undefined}
          />
        ))}
        {hoverI != null && (
          <line x1={xAt(hoverI)} x2={xAt(hoverI)} y1={padT} y2={padT + innerH} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" />
        )}
        {hoverI != null &&
          series.map((s, si) => {
            const dv = s.data[hoverI];
            return dv != null ? (
              <circle key={'p' + si} cx={xAt(hoverI)} cy={yAt(dv)} r={4} fill={col(colors, si)} stroke="var(--layer-01)" strokeWidth={2} />
            ) : null;
          })}
        {brush && (
          <rect
            x={Math.min(brush.x0, brush.x1)}
            y={padT}
            width={Math.abs(brush.x1 - brush.x0)}
            height={innerH}
            fill="var(--brand)"
            opacity={0.16}
            stroke="var(--brand)"
            strokeWidth={1}
          />
        )}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- Bar chart ---------------- */
export interface BarChartProps {
  data?: CategoryPoint[];
  series?: ChartSeries[];
  height?: number;
  horizontal?: boolean;
  stacked?: boolean;
  colors?: string[];
  yFormat?: (n: number | null | undefined) => string;
  labels?: string[];
  barColor?: string;
  animate?: boolean;
}
export function BarChart({
  data = [],
  series,
  height = 240,
  horizontal = false,
  stacked = false,
  colors = DV,
  yFormat = fmtNum,
  labels,
  barColor,
  animate = true,
}: BarChartProps) {
  const mounted = useMounted();
  const [ref, w] = useMeasure();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hover, setHover] = useState<{ ci: number } | null>(null);
  const draw = useDrawIn(animate);
  const cats = labels || data.map((d) => d.label);
  const ser: ChartSeries[] = series || [{ name: 'Value', data: data.map((d) => d.value) }];
  const padL = 44, padR = 12, padT = 12, padB = horizontal ? 12 : 28;
  const padLh = horizontal ? 96 : padL;
  const innerW = Math.max(10, w - padLh - padR), innerH = height - padT - padB;
  const nc = cats.length;
  const totals = cats.map((_, ci) => ser.reduce((a, s) => a + (s.data[ci] || 0), 0));
  const maxV = stacked ? niceMax(Math.max(1, ...totals)) : niceMax(Math.max(1, ...ser.flatMap((s) => s.data.map((v) => v ?? 0))));
  const single = ser.length === 1;

  if (!mounted) return <div ref={ref} style={{ width: '100%', height }} />;

  if (horizontal) {
    const rowH = innerH / nc;
    const barH = Math.min(20, rowH * 0.55);
    return (
      <div ref={ref} style={{ width: '100%', position: 'relative' }}>
        <svg width="100%" height={height}>
          {cats.map((c, ci) => {
            const y = padT + ci * rowH + rowH / 2;
            let xCursor = padLh;
            return (
              <g key={ci}>
                <text x={padLh - 8} y={y + 4} textAnchor="end" fontSize={12} fill="var(--text-secondary)">
                  {c.length > 14 ? c.slice(0, 13) + '…' : c}
                </text>
                {ser.map((s, si) => {
                  const v = s.data[ci] || 0;
                  const wbar = (v / maxV) * innerW;
                  const x = xCursor;
                  xCursor += wbar;
                  const cc = barColor || col(colors, single ? ci : si);
                  return (
                    <rect
                      key={si}
                      x={x}
                      y={y - barH / 2}
                      width={Math.max(0, wbar)}
                      height={barH}
                      fill={cc}
                      rx={0}
                      opacity={hover && hover.ci === ci ? 1 : 0.92}
                      className={draw ? 'cx-bar-h' : ''}
                      style={draw ? { animationDelay: ci * 0.06 + 's' } : undefined}
                      onMouseMove={(e) => {
                        setHover({ ci });
                        setTip({ x: e.clientX, y: e.clientY, title: c, rows: [{ color: cc, label: s.name, value: yFormat(v) }] });
                      }}
                      onMouseLeave={() => {
                        setHover(null);
                        setTip(null);
                      }}
                    />
                  );
                })}
              </g>
            );
          })}
        </svg>
        <Tip tip={tip} />
      </div>
    );
  }

  const colW = innerW / nc;
  const groupW = colW * 0.62;
  const barW = stacked || single ? groupW : groupW / ser.length;
  const gridY = 4;
  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width="100%" height={height}>
        {Array.from({ length: gridY + 1 }).map((_, gi) => {
          const yy = padT + (gi / gridY) * innerH;
          const val = maxV - (gi / gridY) * maxV;
          return (
            <g key={gi}>
              <line x1={padL} x2={padL + innerW} y1={yy} y2={yy} stroke="var(--grid-line)" />
              <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={11} fill="var(--text-helper)">
                {yFormat(val)}
              </text>
            </g>
          );
        })}
        {cats.map((c, ci) => {
          const cx = padL + ci * colW + colW / 2;
          let stackY = padT + innerH;
          return (
            <g key={ci}>
              {ser.map((s, si) => {
                const v = s.data[ci] || 0;
                const h = (v / maxV) * innerH;
                const cc = barColor || col(colors, single ? ci : si);
                let x: number, y: number;
                if (stacked) {
                  x = cx - barW / 2;
                  stackY -= h;
                  y = stackY;
                } else {
                  x = cx - groupW / 2 + si * barW;
                  y = padT + innerH - h;
                }
                return (
                  <rect
                    key={si}
                    x={x}
                    y={y}
                    width={Math.max(0, barW - (stacked ? 0 : 2))}
                    height={Math.max(0, h)}
                    fill={cc}
                    opacity={hover && hover.ci === ci ? 1 : 0.92}
                    className={draw ? 'cx-bar-v' : ''}
                    style={draw ? { animationDelay: ci * 0.05 + si * 0.02 + 's' } : undefined}
                    onMouseMove={(e) => {
                      setHover({ ci });
                      setTip({
                        x: e.clientX,
                        y: e.clientY,
                        title: c,
                        rows: ser.map((ss, i) => ({ color: barColor || col(colors, single ? ci : i), label: ss.name, value: yFormat(ss.data[ci]) })),
                      });
                    }}
                    onMouseLeave={() => {
                      setHover(null);
                      setTip(null);
                    }}
                  />
                );
              })}
              <text x={cx} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--text-helper)">
                {c.length > 10 ? c.slice(0, 9) + '…' : c}
              </text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- Donut ---------------- */
export interface DonutChartProps {
  data?: CategoryPoint[];
  size?: number;
  thickness?: number;
  colors?: string[];
  centerLabel?: ReactNode;
  centerSub?: ReactNode;
  valueFormat?: (n: number | null | undefined) => string;
}
export function DonutChart({
  data = [],
  size = 180,
  thickness = 26,
  colors = DV,
  centerLabel,
  centerSub,
  valueFormat = fmtNum,
}: DonutChartProps) {
  const mounted = useMounted();
  const [tip, setTip] = useState<TipState | null>(null);
  const [hi, setHi] = useState<number | null>(null);
  const draw = useDrawIn();
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.value / total;
    const a0 = acc * 2 * Math.PI - Math.PI / 2;
    acc += frac;
    const a1 = acc * 2 * Math.PI - Math.PI / 2;
    const large = frac > 0.5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    return { d: `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`, color: d.color || col(colors, i), item: d, frac };
  });
  if (!mounted) return <div style={{ width: size, height: size }} />;
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <svg width={size} height={size}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--layer-03)" strokeWidth={thickness} />
        {segs.map((s, i) => (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={s.color}
            strokeWidth={hi === i ? thickness + 4 : thickness}
            strokeLinecap="butt"
            pathLength={1}
            className={draw ? 'cx-line' : ''}
            style={{ transition: 'stroke-width 90ms', animationDelay: 0.1 + i * 0.13 + 's' }}
            onMouseMove={(e) => {
              setHi(i);
              setTip({ x: e.clientX, y: e.clientY, title: s.item.label, rows: [{ color: s.color, label: Math.round(s.frac * 100) + '%', value: valueFormat(s.item.value) }] });
            }}
            onMouseLeave={() => {
              setHi(null);
              setTip(null);
            }}
          />
        ))}
        {centerLabel && (
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            fontSize={size * 0.16}
            fontWeight={300}
            fill="var(--text-primary)"
            className={draw ? 'cx-fade' : ''}
            style={{ fontVariantNumeric: 'tabular-nums', animationDelay: '.5s' }}
          >
            {centerLabel}
          </text>
        )}
        {centerSub && (
          <text x={cx} y={cy + size * 0.13} textAnchor="middle" fontSize={11} fill="var(--text-helper)">
            {centerSub}
          </text>
        )}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({
  data = [],
  width = 120,
  height = 36,
  color = 'var(--brand)',
  area = true,
  strokeWidth = 1.5,
  fluid = false,
}: {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  area?: boolean;
  strokeWidth?: number;
  fluid?: boolean;
}) {
  const mounted = useMounted();
  const draw = useDrawIn();
  const max = Math.max(...data), min = Math.min(...data), rng = max - min || 1;
  const xAt = (i: number) => (i / (data.length - 1)) * width;
  const yAt = (v: number) => height - 2 - ((v - min) / rng) * (height - 4);
  let d = '';
  data.forEach((v, i) => {
    d += i === 0 ? `M${xAt(i)},${yAt(v)}` : ` L${xAt(i)},${yAt(v)}`;
  });
  const ad = d + ` L${width},${height} L0,${height} Z`;
  // Stable, SSR-safe gradient id (Math.random would cause a hydration mismatch).
  const gid = 'sg' + useId().replace(/[:«»]/g, '');
  const last = data[data.length - 1] ?? 0;
  const svgProps: React.SVGProps<SVGSVGElement> = fluid
    ? { viewBox: `0 0 ${width} ${height}`, preserveAspectRatio: 'none', style: { display: 'block', width: '100%', height } }
    : { width, height, style: { display: 'block', overflow: 'visible' } };
  if (!mounted) return <div style={{ width: fluid ? '100%' : width, height }} />;
  return (
    <svg {...svgProps}>
      {area && (
        <defs>
          <linearGradient id={gid} x1={0} y1={0} x2={0} y2={1}>
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      )}
      {area && <path d={ad} fill={`url(#${gid})`} className={draw ? 'cx-fade' : ''} />}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect={fluid ? 'non-scaling-stroke' : undefined}
        pathLength={draw ? 1 : undefined}
        className={draw ? 'cx-line' : ''}
      />
      {!fluid && <circle cx={width} cy={yAt(last)} r={2} fill={color} className={draw ? 'cx-fade' : ''} style={{ animationDelay: '.6s' }} />}
    </svg>
  );
}

/* ---------------- 100% distribution bar ---------------- */
export function DistBar({
  segments = [],
  height = 8,
  colors = DV,
  radius = 0,
}: {
  segments?: CategoryPoint[];
  height?: number;
  colors?: string[];
  radius?: number;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const [tip, setTip] = useState<TipState | null>(null);
  const draw = useDrawIn();
  return (
    <div style={{ position: 'relative' }}>
      <div className={draw ? 'cx-grow-h' : ''} style={{ display: 'flex', height, borderRadius: radius, overflow: 'hidden', background: 'var(--layer-03)' }}>
        {segments.map((s, i) => (
          <div
            key={i}
            style={{ width: (s.value / total) * 100 + '%', background: s.color || col(colors, i), transition: 'width .3s' }}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: s.label, rows: [{ color: s.color || col(colors, i), label: Math.round((s.value / total) * 100) + '%', value: fmtNum(s.value) }] })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- Radial gauge ---------------- */
export function RadialGauge({
  value = 0,
  max = 100,
  size = 140,
  thickness = 12,
  color = 'var(--brand)',
  label,
  sub,
}: {
  value?: number;
  max?: number;
  size?: number;
  thickness?: number;
  color?: string;
  label?: ReactNode;
  sub?: ReactNode;
}) {
  const frac = Math.max(0, Math.min(1, value / max));
  const r = (size - thickness) / 2, cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  const arcLen = circ * 0.75;
  return (
    <div style={{ position: 'relative', width: size, height: size * 0.82 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(135deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--layer-03)" strokeWidth={thickness} strokeDasharray={`${arcLen} ${circ}`} strokeLinecap="round" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeDasharray={`${arcLen * frac} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray .5s' }} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: size * 0.06 }}>
        <div style={{ fontSize: size * 0.2, fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-helper)' }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ---------------- Mini heat strip ---------------- */
export function HeatStrip({
  data = [],
  cols = 24,
  height = 10,
  color = '#1192e8',
  live = false,
}: {
  data?: number[];
  cols?: number;
  height?: number;
  color?: string;
  live?: boolean;
}) {
  const [d, setD] = useState<number[]>(data);
  useEffect(() => {
    setD(data);
    if (!live) return;
    const id = setInterval(() => {
      setD((prev) => prev.map((v) => Math.max(0, Math.round(v * (0.92 + Math.random() * 0.16)))));
    }, 1400);
    return () => clearInterval(id);
  }, [live, data]);
  const max = Math.max(...d, 1);
  const [tip, setTip] = useState<TipState | null>(null);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 2 }}>
        {d.map((v, i) => (
          <div
            key={i}
            className={live && i === d.length - 1 ? 'live-cell' : ''}
            style={{ height, background: color, opacity: 0.15 + 0.85 * (v / max), borderRadius: 1, transition: 'opacity .8s ease' }}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: 'Hour ' + i, rows: [{ color, label: 'requests', value: fmtNum(v) }] })}
            onMouseLeave={() => setTip(null)}
          />
        ))}
      </div>
      <Tip tip={tip} />
    </div>
  );
}

/* ---------------- Live scrolling line (real-time monitor) ---------------- */
export function LiveLine({
  height = 200,
  color = '#1192e8',
  base = 3200,
  vol = 420,
  interval = 1200,
  label = 'req/s',
}: {
  height?: number;
  color?: string;
  base?: number;
  vol?: number;
  interval?: number;
  label?: string;
}) {
  const seed = Math.floor(base);
  const [buf, setBuf] = useState<number[]>(() =>
    genSeries(seed, 40, base, vol * 0.6, 0).map((v) => Math.max(base * 0.4, Math.round(v))),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setBuf((p) => {
        const last = p[p.length - 1] ?? base;
        const nv = Math.max(Math.round(base * 0.3), Math.round(last + (Math.random() - 0.5) * vol));
        return [...p.slice(1), nv];
      });
    }, interval);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const cur = buf[buf.length - 1] ?? 0;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 28, fontWeight: 300, fontVariantNumeric: 'tabular-nums' }}>
          {fmtNum(cur)}
        </span>
        <span style={{ fontSize: 13, color: 'var(--text-helper)' }}>{label}</span>
      </div>
      <LineChart series={[{ name: label, data: buf }]} labels={buf.map(() => '')} height={height} area colors={[color]} yFormat={fmtNum} showGrid animate={false} />
    </div>
  );
}

/* ---------------- Sankey diagram (animated ribbons) ---------------- */
export interface SankeyNode {
  id: string;
  label: string;
  layer: number;
  color?: string;
}
export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color?: string;
}
interface SankeyNodeCalc extends SankeyNode {
  in: number;
  out: number;
  value: number;
  y0: number;
  y1: number;
  h: number;
  x: number;
}
export function SankeyChart({
  nodes = [],
  links = [],
  height = 420,
  nodeWidth = 16,
  nodePad = 16,
  valueFormat = fmtNum,
}: {
  nodes?: SankeyNode[];
  links?: SankeyLink[];
  height?: number;
  nodeWidth?: number;
  nodePad?: number;
  valueFormat?: (n: number) => string;
}) {
  const mounted = useMounted();
  const [ref, w] = useMeasure();
  const draw = useDrawIn(true, 2200);
  const [hl, setHl] = useState<string | null>(null);
  const [tip, setTip] = useState<TipState | null>(null);
  const padX = 8, padTop = 8, padBot = 22;
  const W = Math.max(320, w), H = height;
  const layers = [...new Set(nodes.map((n) => n.layer))].sort((a, b) => a - b);
  const nLayers = layers.length;
  const innerW = W - padX * 2 - nodeWidth;
  const layerX: Record<number, number> = Object.fromEntries(layers.map((l, i) => [l, padX + (nLayers === 1 ? 0 : (i / (nLayers - 1)) * innerW)]));

  const nodeMap: Record<string, SankeyNodeCalc> = Object.fromEntries(nodes.map((n) => [n.id, { ...n, in: 0, out: 0, value: 0, y0: 0, y1: 0, h: 0, x: 0 }]));
  links.forEach((lk) => {
    const t = nodeMap[lk.target], s = nodeMap[lk.source];
    if (t) t.in += lk.value;
    if (s) s.out += lk.value;
  });
  nodes.forEach((n) => {
    const nd = nodeMap[n.id]!;
    nd.value = Math.max(nd.in, nd.out);
  });

  const byLayer: Record<number, string[]> = {};
  layers.forEach((l) => (byLayer[l] = nodes.filter((n) => n.layer === l).map((n) => n.id)));
  const avail = H - padTop - padBot;
  const scale = Math.min(
    ...layers.map((l) => {
      const cnt = byLayer[l]!.length;
      const tot = byLayer[l]!.reduce((a, id) => a + nodeMap[id]!.value, 0);
      return (avail - (cnt - 1) * nodePad) / (tot || 1);
    }),
  );
  layers.forEach((l) => {
    const cnt = byLayer[l]!.length;
    const totalH = byLayer[l]!.reduce((a, id) => a + nodeMap[id]!.value * scale, 0) + (cnt - 1) * nodePad;
    let y = padTop + (avail - totalH) / 2;
    byLayer[l]!.forEach((id) => {
      const nd = nodeMap[id]!;
      nd.y0 = y;
      nd.h = nd.value * scale;
      nd.y1 = y + nd.h;
      nd.x = layerX[l]!;
      y += nd.h + nodePad;
    });
  });

  const outOff: Record<string, number> = {}, inOff: Record<string, number> = {};
  const lastLayer = layers[layers.length - 1];
  const ribbons = links.map((lk) => {
    const s = nodeMap[lk.source]!, t = nodeMap[lk.target]!;
    const th = lk.value * scale;
    const so = outOff[lk.source] || 0, to = inOff[lk.target] || 0;
    outOff[lk.source] = so + th;
    inOff[lk.target] = to + th;
    const sx = s.x + nodeWidth, tx = t.x;
    const sy0 = s.y0 + so, sy1 = sy0 + th, ty0 = t.y0 + to, ty1 = ty0 + th;
    const mx = (sx + tx) / 2;
    const d = `M${sx},${sy0} C${mx},${sy0} ${mx},${ty0} ${tx},${ty0} L${tx},${ty1} C${mx},${ty1} ${mx},${sy1} ${sx},${sy1} Z`;
    return { d, color: s.color || lk.color || '#1192e8', lk, dim: hl && hl !== lk.source && hl !== lk.target };
  });

  if (!mounted) return <div ref={ref} style={{ width: '100%', height: H }} />;

  return (
    <div ref={ref} style={{ width: '100%', position: 'relative' }}>
      <svg width="100%" height={H} className={draw ? 'cx-fade' : ''} style={{ display: 'block' }}>
        <g>
          {ribbons.map((rb, i) => (
            <path
              key={i}
              d={rb.d}
              fill={rb.color}
              opacity={rb.dim ? 0.06 : hl ? 0.55 : 0.32}
              style={{ transition: 'opacity .18s' }}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, title: `${nodeMap[rb.lk.source]!.label} → ${nodeMap[rb.lk.target]!.label}`, rows: [{ color: rb.color, label: 'flow', value: valueFormat(rb.lk.value) }] })}
              onMouseLeave={() => setTip(null)}
            />
          ))}
        </g>
        {nodes.map((n) => {
          const nd = nodeMap[n.id]!;
          const isLast = n.layer === lastLayer;
          return (
            <g key={n.id} onMouseEnter={() => setHl(n.id)} onMouseLeave={() => setHl(null)} style={{ cursor: 'default' }}>
              <rect x={nd.x} y={nd.y0} width={nodeWidth} height={Math.max(1, nd.h)} fill={n.color || '#1192e8'} rx={2} className={draw ? 'cx-bar-v' : ''} style={draw ? { animationDelay: 0.1 + n.layer * 0.12 + 's', transformOrigin: `${nd.x}px ${nd.y1}px` } : undefined} />
              <text x={isLast ? nd.x - 6 : nd.x + nodeWidth + 6} y={(nd.y0 + nd.y1) / 2} textAnchor={isLast ? 'end' : 'start'} dominantBaseline="middle" fontSize={12} fill="var(--text-primary)" fontWeight={500}>
                {n.label}
                <tspan dx={6} fill="var(--text-helper)" fontSize={11}>{valueFormat(nd.value)}</tspan>
              </text>
            </g>
          );
        })}
      </svg>
      <Tip tip={tip} />
    </div>
  );
}
