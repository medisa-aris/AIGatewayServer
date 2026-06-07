'use client';

/** Header dropdown panels: notifications, help, settings. Ported from header-menus.jsx. */

import { Icon } from '@/components/Icon';
import type { Theme } from '@/lib/theme';
import type { ToastInput } from '@/components/ui';

const I = (n: string, p: { size?: number } = {}) => <Icon name={n} {...p} />;

export interface Notif {
  id: string;
  kind: 'warn' | 'error' | 'info' | 'success';
  icon: string;
  title: string;
  body: string;
  time: string;
  to: string;
  unread: boolean;
}

export const NOTIF_SEED: Notif[] = [
  { id: 'n1', kind: 'warn', icon: 'money', title: 'Budget alert — Platform team', body: 'VIP override rule reached 90% of the monthly limit ($45.0k / $50.0k).', time: '8 min ago', to: 'budgets', unread: true },
  { id: 'n2', kind: 'error', icon: 'shield', title: 'Guardrail blocked 14 requests', body: 'Prompt Injection Shield triggered on vm/general-chat in the last hour.', time: '25 min ago', to: 'guardrails', unread: true },
  { id: 'n3', kind: 'warn', icon: 'lock', title: 'PII exception expiring', body: 'github → Email Address exception expires in 2 days. Review or renew.', time: '1 hr ago', to: 'pii', unread: true },
  { id: 'n4', kind: 'info', icon: 'plug', title: 'Provider degraded', body: 'AWS Bedrock latency elevated in us-west-2 (p95 1.8s).', time: '2 hr ago', to: 'providers', unread: false },
  { id: 'n5', kind: 'success', icon: 'route', title: 'Virtual model deployed', body: 'vm/coding-v3 is now serving 100% of routed traffic.', time: '5 hr ago', to: 'virtual-models', unread: false },
];

const KIND_BG: Record<Notif['kind'], string> = {
  warn: 'var(--support-warning)',
  error: 'var(--support-error)',
  info: 'var(--brand)',
  success: 'var(--support-success)',
};

export function NotificationsPanel({
  notifs,
  setNotifs,
  onNav,
  onClose,
}: {
  notifs: Notif[];
  setNotifs: React.Dispatch<React.SetStateAction<Notif[]>>;
  onNav: (id: string) => void;
  onClose: () => void;
}) {
  const unread = notifs.filter((n) => n.unread).length;
  const open = (n: Notif) => {
    setNotifs((list) => list.map((x) => (x.id === n.id ? { ...x, unread: false } : x)));
    onNav(n.to);
    onClose();
  };
  return (
    <div className="hpanel" style={{ width: 392 }} onClick={(e) => e.stopPropagation()}>
      <div className="hpanel-head">
        <span className="ht">
          Notifications
          {unread > 0 && <span style={{ color: 'var(--text-helper)', fontWeight: 400 }}>{'  ·  ' + unread + ' new'}</span>}
        </span>
        <button className="ha" disabled={unread === 0} onClick={() => setNotifs((list) => list.map((x) => ({ ...x, unread: false })))}>
          Mark all read
        </button>
      </div>
      <div className="hpanel-list">
        {notifs.map((n) => (
          <button key={n.id} className={'noti ' + (n.unread ? 'unread' : '')} onClick={() => open(n)}>
            <span className="ni" style={{ background: `color-mix(in srgb,${KIND_BG[n.kind]} 16%,transparent)`, color: KIND_BG[n.kind] }}>
              {I(n.icon, { size: 16 })}
            </span>
            <span className="nx">
              <span className="nt">{n.title}</span>
              <span className="nb">{n.body}</span>
              <span className="nm">{n.time}</span>
            </span>
          </button>
        ))}
      </div>
      <div className="hpanel-foot">
        <button
          onClick={() => {
            onNav('overview');
            onClose();
          }}
        >
          View activity overview
        </button>
      </div>
    </div>
  );
}

export function HelpPanel({
  onClose,
  onNav,
  push,
  onOpenSearch,
}: {
  onClose: () => void;
  onNav: (id: string) => void;
  push: (t: ToastInput) => void;
  onOpenSearch: () => void;
}) {
  const items = [
    { icon: 'document', label: 'Documentation', sub: 'Guides, concepts & API surface', act: () => push({ title: 'Opening documentation', kind: 'info' }) },
    { icon: 'code', label: 'API reference', sub: 'OpenAI-compatible endpoints', act: () => push({ title: 'Opening API reference', kind: 'info' }) },
    { icon: 'idea', label: 'Keyboard shortcuts', sub: 'Press ⌘K to search anywhere', act: onOpenSearch },
    { icon: 'flow', label: 'Architecture & hooks', sub: 'How routing & guardrails fit', act: () => { onNav('guardrails'); onClose(); } },
    { icon: 'globe', label: 'System status', sub: 'All systems operational', act: () => push({ title: 'All systems operational', kind: 'success' }) },
    { icon: 'star', label: "What's new", sub: 'v1.0.0 release notes', act: () => push({ title: "What's new in v1.0.0", kind: 'info' }) },
  ];
  return (
    <div className="hpanel" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
      <div className="hpanel-head">
        <span className="ht">Help & resources</span>
      </div>
      <div className="hpanel-list" style={{ padding: '4px 0' }}>
        {items.map((it) => (
          <button key={it.label} className="ovm-item" style={{ height: 'auto', padding: '10px 16px', alignItems: 'flex-start' }} onClick={() => it.act && it.act()}>
            <span style={{ color: 'var(--brand)', marginTop: 1 }}>{I(it.icon)}</span>
            <span className="oi-tx">
              <span>{it.label}</span>
              <span className="hp-sub">{it.sub}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SettingsPanel({
  onClose,
  onNav,
  theme,
  setTheme,
  push,
}: {
  onClose: () => void;
  onNav: (id: string) => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
  push: (t: ToastInput) => void;
}) {
  const nav = (id: string) => {
    onNav(id);
    onClose();
  };
  return (
    <div className="hpanel" style={{ width: 320 }} onClick={(e) => e.stopPropagation()}>
      <div className="hpanel-head">
        <span className="ht">Settings</span>
      </div>
      <div className="hpanel-list" style={{ padding: '4px 0' }}>
        <div className="ovm-item" style={{ justifyContent: 'space-between', cursor: 'default' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {I(theme === 'light' ? 'sun' : 'moon')}Appearance
          </span>
          <button className="ha" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
            {theme === 'light' ? 'Light' : 'Dark'}
            {I('chevronDown', { size: 14 })}
          </button>
        </div>
        <div className="ovm-sep" />
        <button className="ovm-item" onClick={() => nav('config')}>{I('settings')}System configuration</button>
        <button className="ovm-item" onClick={() => nav('tokens')}>{I('key')}API tokens</button>
        <button className="ovm-item" onClick={() => nav('auth')}>{I('lock')}Authentication</button>
        <button className="ovm-item" onClick={() => nav('org')}>{I('flow')}Organization</button>
        <div className="ovm-sep" />
        <button className="ovm-item" onClick={() => { push({ title: 'Preferences saved', kind: 'success' }); onClose(); }}>
          {I('sliders')}Notification preferences
        </button>
      </div>
    </div>
  );
}
