'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/theme';

interface ErdData {
  mermaid: string;
  tableCount: number;
}

interface Transform {
  scale: number;
  x: number;
  y: number;
}

const MIN_SCALE      = 0.05;  // 5%
const MAX_SCALE      = 30;    // 3000%
const DEFAULT_STEP   = 50;    // 50% per step

/** Mermaid theme variable sets keyed by app theme. */
const MERMAID_THEMES = {
  dark: {
    theme: 'dark' as const,
    vars: {
      background:                    '#161616',
      primaryColor:                  '#262626',
      primaryBorderColor:            '#525252',
      primaryTextColor:              '#f4f4f4',
      secondaryColor:                '#393939',
      secondaryTextColor:            '#c6c6c6',
      tertiaryColor:                 '#262626',
      lineColor:                     '#6f6f6f',
      edgeLabelBackground:           '#262626',
      attributeBackgroundColorEven:  '#1e1e1e',
      attributeBackgroundColorOdd:   '#262626',
      fontFamily:                    'IBM Plex Sans, sans-serif',
    },
  },
  light: {
    theme: 'default' as const,
    vars: {
      background:                    '#f4f4f4',
      primaryColor:                  '#ffffff',
      primaryBorderColor:            '#c6c6c6',
      primaryTextColor:              '#161616',
      secondaryColor:                '#f4f4f4',
      secondaryTextColor:            '#525252',
      tertiaryColor:                 '#ffffff',
      lineColor:                     '#8d8d8d',
      edgeLabelBackground:           '#f4f4f4',
      attributeBackgroundColorEven:  '#ffffff',
      attributeBackgroundColorOdd:   '#f4f4f4',
      fontFamily:                    'IBM Plex Sans, sans-serif',
    },
  },
};

export default function ErdPage() {
  const { theme } = useTheme();
  const [data, setData]           = useState<ErdData | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [loading, setLoading]     = useState(true);
  const [transform, setTransform] = useState<Transform>({ scale: 1, x: 0, y: 0 });
  const [svgNatW, setSvgNatW]     = useState(0);
  const [svgNatH, setSvgNatH]     = useState(0);

  // Zoom input draft — tracks typed value; synced from transform.scale externally
  const [zoomDraft, setZoomDraft]   = useState('100');
  // Step input — percentage integer, e.g. 50 means ±50% per step
  const [stepPct, setStepPct]       = useState(DEFAULT_STEP);
  const [stepDraft, setStepDraft]   = useState(String(DEFAULT_STEP));
  // Ref so the wheel handler (set up once) always reads the latest step
  const stepRef = useRef(DEFAULT_STEP / 100);

  const viewportRef  = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging   = useRef(false);
  const lastMouse    = useRef({ x: 0, y: 0 });
  const renderKey    = useRef(0);

  // Keep stepRef in sync with stepPct state
  useEffect(() => { stepRef.current = stepPct / 100; }, [stepPct]);

  // Sync zoom input display whenever transform.scale changes externally
  useEffect(() => {
    setZoomDraft(String(Math.round(transform.scale * 100)));
  }, [transform.scale]);

  // ── Fetch schema ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/erd')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error + (d.detail ? `: ${d.detail}` : ''));
        else setData(d as ErdData);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── Render Mermaid ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!data || !containerRef.current) return;

    const mTheme = MERMAID_THEMES[theme] ?? MERMAID_THEMES.dark;
    const id = `erd-svg-${++renderKey.current}`;

    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: mTheme.theme,
        er: { diagramPadding: 24, layoutDirection: 'TB', minEntityWidth: 110 },
        themeVariables: mTheme.vars,
      });

      mermaid.render(id, data.mermaid).then(({ svg }) => {
        if (!containerRef.current) return;
        containerRef.current.innerHTML = svg;

        const svgEl = containerRef.current.querySelector('svg');
        if (svgEl) {
          svgEl.style.display  = 'block';
          svgEl.style.maxWidth = 'none';

          const vb   = svgEl.viewBox.baseVal;
          const natW = vb?.width  || parseFloat(svgEl.getAttribute('width')  || '0') || 800;
          const natH = vb?.height || parseFloat(svgEl.getAttribute('height') || '0') || 600;
          setSvgNatW(natW);
          setSvgNatH(natH);

          // Fit diagram to viewport with padding, then center it
          requestAnimationFrame(() => {
            const vp = viewportRef.current;
            if (!vp) return;
            const padding = 48;
            const fitScale = Math.min(
              (vp.clientWidth  - padding * 2) / natW,
              (vp.clientHeight - padding * 2) / natH,
              1,  // never scale up beyond 100%
            );
            const scale = Math.max(MIN_SCALE, fitScale);
            setTransform({
              scale,
              x: (vp.clientWidth  - natW * scale) / 2,
              y: (vp.clientHeight - natH * scale) / 2,
            });
          });
        }
      });
    });
  }, [data, theme]);

  // ── Non-passive wheel zoom (uses stepRef so no re-registration needed) ────
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? stepRef.current : -stepRef.current;
      setTransform((prev) => {
        const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev.scale + delta));
        const rect = el.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        return {
          scale: nextScale,
          x: mx - (mx - prev.x) * (nextScale / prev.scale),
          y: my - (my - prev.y) * (nextScale / prev.scale),
        };
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Drag-to-pan ───────────────────────────────────────────────────────────
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    lastMouse.current  = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setTransform((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  }, []);

  const stopDrag = useCallback(() => { isDragging.current = false; }, []);

  // ── Zoom helpers ──────────────────────────────────────────────────────────
  const applyScale = useCallback((scale: number) => {
    const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
    const vp = viewportRef.current;
    if (!vp) { setTransform((p) => ({ ...p, scale: clamped })); return; }
    const cx = vp.clientWidth / 2;
    const cy = vp.clientHeight / 2;
    setTransform((prev) => ({
      scale: clamped,
      x: cx - (cx - prev.x) * (clamped / prev.scale),
      y: cy - (cy - prev.y) * (clamped / prev.scale),
    }));
  }, []);

  const zoomIn    = () => setTransform((p) => {
    const next = Math.min(MAX_SCALE, p.scale + stepRef.current);
    return { ...p, scale: next };
  });
  const zoomOut   = () => setTransform((p) => {
    const next = Math.max(MIN_SCALE, p.scale - stepRef.current);
    return { ...p, scale: next };
  });
  const zoomFit = () => {
    const vp = viewportRef.current;
    if (!vp || !svgNatW) return;
    const padding = 48;
    const fitScale = Math.min(
      (vp.clientWidth  - padding * 2) / svgNatW,
      (vp.clientHeight - padding * 2) / svgNatH,
      1,
    );
    const scale = Math.max(MIN_SCALE, fitScale);
    setTransform({
      scale,
      x: (vp.clientWidth  - svgNatW * scale) / 2,
      y: (vp.clientHeight - svgNatH * scale) / 2,
    });
  };

  // ── Zoom input commit ─────────────────────────────────────────────────────
  const commitZoom = () => {
    const val = parseInt(zoomDraft, 10);
    if (isNaN(val)) {
      setZoomDraft(String(Math.round(transform.scale * 100)));
      return;
    }
    applyScale(val / 100);
  };

  // ── Step input commit ─────────────────────────────────────────────────────
  const commitStep = () => {
    const val = parseInt(stepDraft, 10);
    if (isNaN(val) || val < 1) {
      setStepDraft(String(stepPct));
      return;
    }
    const clamped = Math.min(3000, val);
    setStepPct(clamped);
    setStepDraft(String(clamped));
  };

  const inputStyle: React.CSSProperties = {
    height: '28px',
    fontSize: '0.75rem', fontWeight: 600, fontFamily: 'var(--font-mono)',
    background: 'var(--layer-02)', color: 'var(--text-primary)',
    border: '1px solid var(--border-subtle)', borderRadius: '4px',
    padding: '0 0.375rem', textAlign: 'right' as const,
    outline: 'none', width: '3.75rem',
  };

  return (
    <div style={{
      position: 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '1.5rem',
        padding: '1.25rem 1.5rem 1rem',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--layer-01)',
        flexShrink: 0,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <h1 style={{
              fontSize: '1.125rem', fontWeight: 700,
              color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em',
            }}>
              Entity Relationship Diagram Database
            </h1>
            <span style={{
              fontSize: '0.6875rem', fontWeight: 500,
              background: 'var(--tag-green-bg)', color: 'var(--tag-green-fg)',
              borderRadius: '0.75rem', padding: '0.1875rem 0.5rem', whiteSpace: 'nowrap',
            }}>
              Live
            </span>
          </div>

          <p style={{
            margin: '0.3125rem 0 0', fontSize: '0.8125rem',
            color: 'var(--text-secondary)', lineHeight: 1.5, maxWidth: '52rem',
          }}>
            {loading
              ? 'Reading schema from ai.database…'
              : error
              ? 'Could not load schema — see error below.'
              : <>
                  An interactive map of all{' '}
                  <strong style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                    {data?.tableCount} tables
                  </strong>{' '}
                  and their foreign-key relationships in the{' '}
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem' }}>ai.database</code>{' '}
                  PostgreSQL schema. Each entity shows its columns and data types.
                  Use scroll to zoom and drag to pan the diagram.
                </>
            }
          </p>
        </div>

        {/* Right — zoom controls */}
        {data && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            flexShrink: 0, paddingTop: '0.125rem',
          }}>
            <span style={{
              fontSize: '0.75rem', color: 'var(--text-helper)',
              fontFamily: 'var(--font-mono)', marginRight: '0.25rem',
            }}>
              ai.database
            </span>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

            {/* Zoom − / input / % / + */}
            <ToolBtn onClick={zoomOut} title="Zoom out">−</ToolBtn>
            <input
              value={zoomDraft}
              onChange={(e) => setZoomDraft(e.target.value)}
              onBlur={commitZoom}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitZoom(); (e.target as HTMLInputElement).blur(); } }}
              title="Zoom level — type a percentage and press Enter"
              style={inputStyle}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-helper)', fontFamily: 'var(--font-mono)' }}>%</span>
            <ToolBtn onClick={zoomIn} title="Zoom in">+</ToolBtn>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

            {/* Step input */}
            <span style={{ fontSize: '0.6875rem', color: 'var(--text-helper)', whiteSpace: 'nowrap' }}>Step</span>
            <input
              value={stepDraft}
              onChange={(e) => setStepDraft(e.target.value)}
              onBlur={commitStep}
              onKeyDown={(e) => { if (e.key === 'Enter') { commitStep(); (e.target as HTMLInputElement).blur(); } }}
              title="Zoom step — percentage added/subtracted per scroll or button click"
              style={{ ...inputStyle, width: '3rem' }}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-helper)', fontFamily: 'var(--font-mono)' }}>%</span>

            <div style={{ width: '1px', height: '16px', background: 'var(--border-subtle)' }} />

            {/* Fit button */}
            <button
              onClick={zoomFit}
              title="Fit diagram to screen"
              style={{
                height: '28px', fontSize: '0.75rem', fontWeight: 600,
                background: 'var(--layer-02)', color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)', borderRadius: '4px',
                cursor: 'pointer', padding: '0 0.625rem', whiteSpace: 'nowrap',
              }}
            >
              Fit
            </button>
          </div>
        )}
      </div>

      {/* ── Loading ───────────────────────────────────────────────────────────── */}
      {loading && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem', background: 'var(--background)', color: 'var(--text-helper)',
        }}>
          <Spinner />
          <span style={{ fontSize: '0.875rem' }}>Reading database schema…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────────── */}
      {error && !loading && (
        <div style={{ padding: '1.5rem' }}>
          <div style={{
            background: 'var(--support-error-bg)', border: '1px solid var(--support-error)',
            borderRadius: '4px', padding: '1rem 1.25rem',
            color: 'var(--support-error)', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)',
          }}>
            {error}
          </div>
        </div>
      )}

      {/* ── Diagram viewport ──────────────────────────────────────────────────── */}
      {data && !loading && (
        <div
          ref={viewportRef}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={stopDrag}
          onMouseLeave={stopDrag}
          style={{
            position: 'relative', flex: 1, width: '100%',
            overflow: 'hidden', background: 'var(--background)',
            cursor: isDragging.current ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {/* Hint pill */}
          <div style={{
            position: 'absolute', bottom: 14, left: '50%',
            transform: 'translateX(-50%)',
            fontSize: '0.6875rem', color: 'var(--text-helper)',
            background: 'var(--layer-01)', border: '1px solid var(--border-subtle)',
            borderRadius: '999px', padding: '0.25rem 0.75rem',
            pointerEvents: 'none', opacity: 0.85, zIndex: 10, whiteSpace: 'nowrap',
          }}>
            Scroll to zoom · Drag to pan
          </div>

          {/* Table count pill */}
          <div style={{
            position: 'absolute', bottom: 14, right: 16,
            fontSize: '0.6875rem', fontWeight: 500,
            color: 'var(--tag-blue-fg)', background: 'var(--tag-blue-bg)',
            borderRadius: '999px', padding: '0.25rem 0.625rem',
            pointerEvents: 'none', zIndex: 10,
          }}>
            {data.tableCount} tables
          </div>

          {/* Transformed canvas */}
          <div style={{
            transformOrigin: 'top left',
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transition: isDragging.current ? 'none' : 'transform 80ms ease-out',
            padding: '2rem',
            display: 'inline-block',
          }}>
            <div ref={containerRef} />
          </div>
        </div>
      )}
    </div>
  );
}

function ToolBtn({ onClick, title, children }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title} style={{
      width: 28, height: 28, fontSize: '1.05rem', lineHeight: 1, fontWeight: 700,
      background: 'var(--layer-02)', color: 'var(--text-primary)',
      border: '1px solid var(--border-subtle)', borderRadius: '4px',
      cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: '50%',
      border: '3px solid var(--border-subtle)',
      borderTopColor: 'var(--interactive-01, #0f62fe)',
      animation: 'spin 0.75s linear infinite',
    }} />
  );
}
