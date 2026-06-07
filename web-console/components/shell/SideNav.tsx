'use client';

/** Collapsible left side navigation. Active item derived from the route. */

import { useRouter, usePathname } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { NAV } from './nav';

export function SideNav({ collapsed }: { collapsed: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const current = pathname.replace(/^\//, '') || 'overview';

  return (
    <nav className={`sidenav scroll ${collapsed ? 'collapsed' : ''}`}>
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="sidenav-section">{g.group}</div>
          {g.items.map((it) => (
            <button
              key={it.id}
              className={`nav-item ${current === it.id ? 'active' : ''}`}
              onClick={() => router.push('/' + it.id)}
              title={collapsed ? it.label : undefined}
            >
              <span className="ni-icon">
                <Icon name={it.icon} />
              </span>
              <span className="ni-label">{it.label}</span>
              {it.badge && (
                <span className="ni-badge" style={it.badge === 'live' ? { background: 'var(--support-success)' } : undefined}>
                  {it.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-helper)', whiteSpace: 'nowrap', overflow: 'hidden' }}>
        {!collapsed && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="sdot pulse-dot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--support-success)', color: 'var(--support-success)' }} />
              Core Engine · healthy
            </div>
            <div style={{ marginTop: 4, opacity: 0.8 }}>v1.0.0 · 14 pods · 5.2k RPS</div>
          </div>
        )}
      </div>
    </nav>
  );
}
