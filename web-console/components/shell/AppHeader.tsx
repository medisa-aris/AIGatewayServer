'use client';

/** Top UI-shell header: brand, ⌘K search, theme toggle, dropdown panels, user menu. */

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Tag, type ToastInput } from '@/components/ui';
import { useTheme } from '@/lib/theme';
import { useSession } from '@/lib/session';
import { CommandPalette } from './CommandPalette';
import { NOTIF_SEED, NotificationsPanel, HelpPanel, SettingsPanel, type Notif } from './HeaderMenus';

const I = (n: string, p: { size?: number } = {}) => <Icon name={n} {...p} />;

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width={32} height={32} rx={6} fill="url(#pg)" />
      <defs>
        <linearGradient id="pg" x1={0} y1={0} x2={32} y2={32}>
          <stop stopColor="#33b1ff" />
          <stop offset={1} stopColor="#0f62fe" />
        </linearGradient>
      </defs>
      <circle cx={9} cy={16} r={2.4} fill="#fff" />
      <circle cx={22} cy={9} r={2.2} fill="#fff" opacity={0.95} />
      <circle cx={22} cy={23} r={2.2} fill="#fff" opacity={0.95} />
      <path d="M11 15L20 10M11 17L20 22" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}

export function AppHeader({ onMenu, push }: { onMenu: () => void; push: (t: ToastInput) => void }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { user, initials } = useSession();
  const [open, setOpen] = useState<null | 'notif' | 'help' | 'settings' | 'user'>(null);
  const [palette, setPalette] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>(() => NOTIF_SEED.map((n) => ({ ...n })));
  const unread = notifs.filter((n) => n.unread).length;
  const wrapRef = useRef<HTMLDivElement>(null);

  const onNav = (id: string) => router.push('/' + id);
  const logout = async () => {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(null);
        setPalette(true);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const toggle = (id: typeof open) => setOpen((o) => (o === id ? null : id));
  const iconBtn = (id: NonNullable<typeof open>, icon: string, title: string, extra?: React.ReactNode) => (
    <button className="hdr-icon-btn" title={title} onClick={(e) => { e.stopPropagation(); toggle(id); }}>
      {I(icon, { size: 18 })}
      {extra}
    </button>
  );

  return (
    <header className="hdr">
      <button className="hdr-menu" onClick={onMenu} title="Toggle navigation">{I('menu', { size: 20 })}</button>
      <a className="hdr-brand" href="#" onClick={(e) => { e.preventDefault(); onNav('overview'); }}>
        <Logo size={24} />
        <span className="wm">
          <b>Pangreksa</b> <span>AI Router Gateway</span>
        </span>
      </a>
      <div className="hdr-actions" ref={wrapRef}>
        <button className="hdr-icon-btn" title="Search   ⌘K" onClick={(e) => { e.stopPropagation(); setOpen(null); setPalette(true); }}>
          {I('search', { size: 18 })}
        </button>
        <button
          className="hdr-icon-btn"
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
        >
          {I(theme === 'light' ? 'moon' : 'sun', { size: 18 })}
        </button>

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {iconBtn('notif', 'notification', 'Notifications', unread > 0 ? <span className="dot" /> : null)}
          {open === 'notif' && <NotificationsPanel notifs={notifs} setNotifs={setNotifs} onNav={onNav} onClose={() => setOpen(null)} />}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {iconBtn('help', 'help', 'Help')}
          {open === 'help' && <HelpPanel onClose={() => setOpen(null)} onNav={onNav} push={push} onOpenSearch={() => { setOpen(null); setPalette(true); }} />}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          {iconBtn('settings', 'settings', 'Settings')}
          {open === 'settings' && <SettingsPanel onClose={() => setOpen(null)} onNav={onNav} theme={theme} setTheme={setTheme} push={push} />}
        </div>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <button className="hdr-icon-btn" style={{ width: 'auto', padding: '0 12px 0 8px', gap: 8 }} onClick={(e) => { e.stopPropagation(); toggle('user'); }}>
            <div className="hdr-avatar">{initials}</div>
          </button>
          {open === 'user' && (
            <div className="ovm" style={{ right: 8, top: '100%', marginTop: 0, minWidth: 240 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{user?.name ?? 'Loading…'}</div>
                <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>{user?.email ?? ''}</div>
                {user?.orgName && (
                  <div style={{ fontSize: 12, color: 'var(--text-helper)', marginTop: 2 }}>{user.orgName}</div>
                )}
                <div style={{ marginTop: 6 }}>
                  <Tag color="blue" sm>Signed in</Tag>
                </div>
              </div>
              <button className="ovm-item" onClick={() => { setOpen(null); onNav('tokens'); }}>{I('key')}API tokens</button>
              <button className="ovm-item" onClick={() => { setOpen(null); onNav('users'); }}>{I('users')}Users & roles</button>
              <button className="ovm-item" onClick={() => { setOpen(null); onNav('config'); }}>{I('settings')}Settings</button>
              <div className="ovm-sep" />
              <button className="ovm-item danger" onClick={() => { setOpen(null); void logout(); }}>{I('logout')}Sign out</button>
            </div>
          )}
        </div>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} onNav={(id) => onNav(id)} />}
    </header>
  );
}
