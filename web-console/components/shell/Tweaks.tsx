'use client';

/**
 * Floating "Tweaks" panel — accent color, theme, and density.
 * Replaces the design-tool edit-mode scaffold with a real in-app control
 * wired to the ThemeProvider.
 */

import { useState } from 'react';
import { Icon } from '@/components/Icon';
import { ACCENTS, useTheme } from '@/lib/theme';

export function Tweaks() {
  const { theme, setTheme, accent, setAccent, density, setDensity } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 9000 }}>
      {open && (
        <div
          style={{
            width: 248,
            marginBottom: 10,
            background: 'var(--layer-01)',
            border: '1px solid var(--border-subtle)',
            boxShadow: 'var(--shadow-lg)',
            borderRadius: 10,
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="sliders" size={16} />
            Tweaks
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Accent</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {Object.keys(ACCENTS).map((c) => (
                  <button
                    key={c}
                    onClick={() => setAccent(c)}
                    title={c}
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: c,
                      border: accent === c ? '2px solid var(--text-primary)' : '2px solid transparent',
                      cursor: 'pointer',
                    }}
                  />
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Theme</div>
              <div className="ctabs">
                {(['light', 'dark'] as const).map((t) => (
                  <button key={t} className={`ctab ${theme === t ? 'active' : ''}`} onClick={() => setTheme(t)} style={{ textTransform: 'capitalize' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>Density</div>
              <div className="ctabs">
                {(['compact', 'comfy'] as const).map((d) => (
                  <button key={d} className={`ctab ${density === d ? 'active' : ''}`} onClick={() => setDensity(d)} style={{ textTransform: 'capitalize' }}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Tweaks"
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--brand)',
          color: '#fff',
          border: 'none',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 'auto',
          cursor: 'pointer',
        }}
      >
        <Icon name="sliders" size={20} />
      </button>
    </div>
  );
}
