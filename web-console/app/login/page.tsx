'use client';

/**
 * Login — ported from the design's screens-login.jsx.
 * The "API key" path performs real PAT auth against the BFF (`POST /api/auth`).
 * Entra ID / Active Directory remain stubs (no OAuth backend) and show a notice.
 */

import { useEffect, useState, type CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { Btn, Field, Input, Notif } from '@/components/ui';
import { useTheme } from '@/lib/theme';

const I = (n: string, p: { size?: number } = {}) => <Icon name={n} {...p} />;

type Stat = { value: string; label: string };

// Static placeholders shown until the real figures load (and the fallback if the
// public-stats endpoint is unreachable) — keeps the brand panel from blanking.
const FALLBACK_STATS: Stat[] = [
  { value: '48.6M', label: 'calls / day' },
  { value: '0.42%', label: 'error rate' },
  { value: '$1.2M', label: 'spend / day' },
  { value: '1,000+', label: 'models' },
];

function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <rect width={32} height={32} rx={7} fill="url(#lg)" />
      <defs>
        <linearGradient id="lg" x1={0} y1={0} x2={32} y2={32}>
          <stop stopColor="#33b1ff" />
          <stop offset={1} stopColor="#0f62fe" />
        </linearGradient>
      </defs>
      <circle cx={9} cy={16} r={2.6} fill="#fff" />
      <circle cx={22} cy={9} r={2.4} fill="#fff" opacity={0.95} />
      <circle cx={22} cy={23} r={2.4} fill="#fff" opacity={0.95} />
      <path d="M11 15L20 10M11 17L20 22" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" opacity={0.9} />
    </svg>
  );
}

const authBtn: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  width: '100%',
  padding: '14px 16px',
  background: 'var(--layer-01)',
  border: '1px solid var(--border-subtle-2)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  transition: 'background 80ms',
};
const iconBox = (c: string): CSSProperties => ({
  width: 36,
  height: 36,
  borderRadius: 8,
  background: c,
  color: '#fff',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
});

export default function LoginPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [step, setStep] = useState<'select' | 'key'>('select');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [externalNotice, setExternalNotice] = useState(false);
  const [stats, setStats] = useState<Stat[]>(FALLBACK_STATS);

  useEffect(() => {
    let alive = true;
    fetch('/api/public-stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { stats?: Stat[] } | null) => {
        if (alive && d?.stats?.length) setStats(d.stats);
      })
      .catch(() => {/* keep fallback */});
    return () => { alive = false; };
  }, []);

  async function doLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Sign-in failed');
        setBusy(false);
        return;
      }
      router.push('/overview');
    } catch {
      setError('Could not reach the server');
      setBusy(false);
    }
  }

  return (
    <div style={{ height: '100vh', display: 'flex', background: 'var(--background)' }}>
      {/* Brand panel */}
      <div style={{ flex: '1 1 46%', background: '#161616', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '56px 56px' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.5, background: 'radial-gradient(1200px 600px at 20% 10%, rgba(17,146,232,0.22), transparent 60%), radial-gradient(900px 500px at 80% 90%, rgba(15,98,254,0.20), transparent 55%)' }} />
        <svg style={{ position: 'absolute', right: -80, top: 80, opacity: 0.16 }} width={520} height={520} viewBox="0 0 200 200" fill="none" stroke="#33b1ff" strokeWidth={0.7}>
          {Array.from({ length: 10 }).map((_, i) => (
            <circle key={i} cx={40 + (i % 5) * 30} cy={50 + Math.floor(i / 5) * 60} r={6} />
          ))}
          <path d="M40 50 L70 50 L100 110 L130 50 L160 50 M40 110 L70 110 L100 50" />
        </svg>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12, color: '#fff' }}>
          <Logo size={36} />
          <span style={{ fontSize: 18, fontWeight: 600 }}>
            Pangreksa <span style={{ fontWeight: 300, opacity: 0.8 }}>AI Router Gateway</span>
          </span>
        </div>
        <div style={{ position: 'relative', color: '#fff' }}>
          <div style={{ fontSize: 38, fontWeight: 300, lineHeight: 1.15, letterSpacing: '-0.02em', maxWidth: '18ch' }}>
            One API surface for <span style={{ color: '#33b1ff' }}>1,000+ models</span> across 100+ providers.
          </div>
          <div style={{ fontSize: 15, color: '#a8c7e8', marginTop: 20, maxWidth: '42ch', lineHeight: 1.6 }}>
            Intelligent routing, prompt caching, guardrails, budgets, and full observability — behind one OpenAI-compatible endpoint.
          </div>
          <div style={{ display: 'flex', gap: 28, marginTop: 36 }}>
            {stats.map((s, i) => (
              <div key={i}>
                <div style={{ fontSize: 24, fontWeight: 300, color: '#fff' }} className="mono">{s.value}</div>
                <div style={{ fontSize: 12, color: '#7a9cc0' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ position: 'relative', fontSize: 12, color: '#5f7d9c' }}>SOC 2 · TLS 1.3 · AES-256 at rest · iSAQB CPSA-A aligned</div>
      </div>

      {/* Form panel */}
      <div style={{ flex: '1 1 54%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
        <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} className="btn ghost sm btn-icon-only" style={{ position: 'absolute', top: 24, right: 24 }} title="Toggle theme">
          {I(theme === 'light' ? 'moon' : 'sun', { size: 18 })}
        </button>
        <div style={{ width: 400, maxWidth: 'calc(100vw - 48px)' }}>
          <div style={{ marginBottom: 32 }}>
            <h1 style={{ fontSize: 28, fontWeight: 400, margin: 0 }}>Sign in</h1>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 8 }}>
              {step === 'select' ? 'Choose how you want to authenticate.' : 'Enter your Pangreksa API key.'}
            </p>
          </div>

          {externalNotice && (
            <div style={{ marginBottom: 16 }}>
              <Notif kind="info" title="Backend configuration required" onClose={() => setExternalNotice(false)}>
                Entra ID and Active Directory sign-in require an OAuth/LDAP backend that isn’t wired in this build. Use an API key instead.
              </Notif>
            </div>
          )}

          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button className="auth-btn" onClick={() => setExternalNotice(true)} style={authBtn}>
                <span style={iconBox('#0078d4')}>{I('cloud', { size: 18 })}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>Microsoft Entra ID</b>
                  <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>OIDC · single sign-on</span>
                </span>
                {I('arrowRight', { size: 16 })}
              </button>
              <button className="auth-btn" onClick={() => setExternalNotice(true)} style={authBtn}>
                <span style={iconBox('#6929c4')}>{I('server', { size: 18 })}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>Active Directory</b>
                  <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>LDAPS · Kerberos SSO</span>
                </span>
                {I('arrowRight', { size: 16 })}
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '8px 0', color: 'var(--text-placeholder)', fontSize: 12 }}>
                <span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />OR<span style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
              </div>
              <button className="auth-btn" onClick={() => setStep('key')} style={authBtn}>
                <span style={iconBox('#0f62fe')}>{I('key', { size: 18 })}</span>
                <span style={{ flex: 1, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 14 }}>API key</b>
                  <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>Personal or virtual-account token</span>
                </span>
                {I('arrowRight', { size: 16 })}
              </button>
            </div>
          )}

          {step === 'key' && (
            <div>
              {error && (
                <div style={{ marginBottom: 16 }}>
                  <Notif kind="error" title="Sign-in failed" onClose={() => setError(null)}>
                    {error}
                  </Notif>
                </div>
              )}
              <Field label="API key" help="SHA-256 hashed and matched against your active keys.">
                <div style={{ position: 'relative' }}>
                  <Input value={apiKey} onChange={setApiKey} type={showKey ? 'text' : 'password'} placeholder="pk-…" mono />
                  <button onClick={() => setShowKey((s) => !s)} style={{ position: 'absolute', right: 8, top: 8, border: 'none', background: 'none', color: 'var(--icon-secondary)', width: 24, height: 24, cursor: 'pointer' }}>
                    {I(showKey ? 'viewOff' : 'view', { size: 16 })}
                  </button>
                </div>
              </Field>
              <Btn kind="primary" iconRight="arrowRight" className="login-cta" onClick={doLogin} disabled={busy || !apiKey.trim()}>
                {busy ? 'Signing in…' : 'Sign in'}
              </Btn>
              <button onClick={() => { setStep('select'); setError(null); }} style={{ marginTop: 16, border: 'none', background: 'none', color: 'var(--link-primary)', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                {I('chevronLeft', { size: 14 })}Other sign-in options
              </button>
            </div>
          )}

          <div style={{ marginTop: 40, fontSize: 12, color: 'var(--text-helper)', textAlign: 'center' }}>Protected by RS256 JWT sessions · v1.0.0</div>
        </div>
      </div>
    </div>
  );
}
