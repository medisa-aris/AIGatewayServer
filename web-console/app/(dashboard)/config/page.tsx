'use client';

/**
 * Administration → Configuration. System settings persisted into the first
 * organization's `settings` JSONB via PATCH. The gateway engine does not yet
 * enforce these — they are stored configuration. Marked ⚠️ (partial).
 */

import { useEffect, useState } from 'react';
import { PageHead, Btn, Field, Input, Select, Toggle, Notif } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { useResourceList } from '@/lib/hooks';
import { updateResource, ApiError } from '@/lib/api/resources';
import type { Organization } from '@/lib/types';

type Settings = Record<string, unknown>;

export default function ConfigPage() {
  const { data: orgs, mutate } = useResourceList<Organization>('organizations', { limit: 1 });
  const org = orgs[0];
  const [s, setS] = useState<Settings>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (org) setS({ ...(org.settings as Settings | null) });
  }, [org]);

  const set = (k: string, v: unknown) => {
    setS((prev) => ({ ...prev, [k]: v }));
    setDirty(true);
  };
  const str = (k: string, d = '') => (s[k] == null ? d : String(s[k]));
  const bool = (k: string, d = false) => (s[k] == null ? d : s[k] === true || s[k] === 'true');

  async function save() {
    if (!org) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateResource('organizations', org.id, { settings: s });
      setDirty(false);
      setMsg('Configuration saved to organization settings.');
      mutate();
    } catch (e) {
      setMsg((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHead title="Configuration" sub={`System-level settings stored in organizations.settings JSONB${org ? ` · ${org.name}` : ''}.`} actions={<Btn kind="primary" size="sm" icon="save" disabled={!dirty || busy} onClick={save}>{busy ? 'Saving…' : 'Save changes'}</Btn>} />

      {msg && <Section style={{ paddingTop: 16 }}><Notif kind="info" onClose={() => setMsg(null)}>{msg}</Notif></Section>}

      <Section title="General" style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
          <Field label="System name"><Input value={str('system_name', 'Pangreksa Gateway')} onChange={(v) => set('system_name', v)} /></Field>
          <Field label="Region"><Select value={str('region', 'us-east')} onChange={(v) => set('region', v)} options={['us-east', 'us-west', 'eu-west', 'ap-southeast']} /></Field>
          <Field label="Gateway base URL"><Input value={str('base_url', 'https://gateway.pangreksa.io')} onChange={(v) => set('base_url', v)} mono /></Field>
          <Field label="Deployment model"><Select value={str('deployment', 'saas')} onChange={(v) => set('deployment', v)} options={['saas', 'self-hosted', 'hybrid']} /></Field>
        </div>
      </Section>

      <Section title="Routing & engine" style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
          <Field label="Default strategy"><Select value={str('routing_strategy', 'weight-based')} onChange={(v) => set('routing_strategy', v)} options={['weight-based', 'latency-based', 'priority-based', 'sticky']} /></Field>
          <Field label="Retries"><Input type="number" value={str('retries', '2')} onChange={(v) => set('retries', v)} /></Field>
          <Field label="Request timeout (s)"><Input type="number" value={str('timeout_s', '60')} onChange={(v) => set('timeout_s', v)} /></Field>
          <Field label="Per-pod concurrency"><Input type="number" value={str('concurrency', '256')} onChange={(v) => set('concurrency', v)} /></Field>
        </div>
      </Section>

      <Section title="Caching" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
          <Toggle on={bool('cache_exact', true)} onChange={(v) => set('cache_exact', v)} label="Exact-match cache" />
          <Toggle on={bool('cache_semantic', false)} onChange={(v) => set('cache_semantic', v)} label="Semantic cache" />
          <Field label="Cache TTL (s)"><Input type="number" value={str('cache_ttl', '3600')} onChange={(v) => set('cache_ttl', v)} /></Field>
        </div>
      </Section>

      <Section title="Security" style={{ paddingTop: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 720 }}>
          <Toggle on={bool('tls13', true)} onChange={(v) => set('tls13', v)} label="Require TLS 1.3" />
          <Toggle on={bool('rls', true)} onChange={(v) => set('rls', v)} label="Row-level tenant isolation" />
          <Toggle on={bool('audit_log', true)} onChange={(v) => set('audit_log', v)} label="Immutable audit log" />
          <Field label="Audit retention (days)"><Input type="number" value={str('audit_days', '365')} onChange={(v) => set('audit_days', v)} /></Field>
        </div>
      </Section>

      <Section title="Alerts" style={{ paddingTop: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
          <Field label="Budget alert thresholds"><Input value={str('alert_thresholds', '75,90,95,100')} onChange={(v) => set('alert_thresholds', v)} mono /></Field>
          <Field label="Slack webhook"><Input value={str('slack_webhook', '')} onChange={(v) => set('slack_webhook', v)} mono placeholder="https://hooks.slack.com/…" /></Field>
        </div>
      </Section>
    </div>
  );
}
