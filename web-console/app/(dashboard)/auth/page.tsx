'use client';

/**
 * Administration → Authentication. Three identity providers (Local / Entra ID /
 * Active Directory). UI-only configuration — there is no OAuth/LDAP backend, so
 * these panels are stubs. Marked ⚠️.
 */

import { useState } from 'react';
import { PageHead, Tag, Toggle, Field, Input, Notif } from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { SEED } from '@/lib/seed';

export default function AuthPage() {
  const [open, setOpen] = useState<string | null>('local');
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ local: true, entra: true, ad: true });

  return (
    <div>
      <PageHead title="Authentication" sub="Identity providers and session policy. Local username/password is active; Entra ID and Active Directory are configuration stubs." />
      <Section style={{ paddingTop: 16 }}>
        <Notif kind="info" title="Backend integration required">Entra ID (OIDC) and Active Directory (LDAPS) require backend wiring that isn’t implemented in this build. Settings below are stored as configuration only.</Notif>
      </Section>
      <Section style={{ paddingTop: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {SEED.authProviders.map((p) => (
            <div key={p.id} className="tile" style={{ padding: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer' }} onClick={() => setOpen((o) => (o === p.id ? null : p.id))}>
                <span style={{ color: 'var(--brand)' }}><Icon name={p.icon} size={20} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p.name}
                    <Tag color="blue" sm>{p.badge}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>{p.desc}</div>
                </div>
                <Toggle on={enabled[p.id]} onChange={(v) => setEnabled((s) => ({ ...s, [p.id]: v }))} />
                <Icon name={open === p.id ? 'chevronUp' : 'chevronDown'} size={16} />
              </div>
              {open === p.id && (
                <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16, maxWidth: 720 }}>
                    {p.id === 'local' && (
                      <>
                        <Field label="Password hash"><Input value="Argon2id" onChange={() => {}} /></Field>
                        <Field label="MFA"><Input value="TOTP required" onChange={() => {}} /></Field>
                        <Field label="Lockout after"><Input value="5 attempts" onChange={() => {}} /></Field>
                        <Field label="Session TTL"><Input value="24h" onChange={() => {}} /></Field>
                      </>
                    )}
                    {p.id === 'entra' && (
                      <>
                        <Field label="Tenant ID"><Input value="" onChange={() => {}} placeholder="00000000-0000-…" mono /></Field>
                        <Field label="Client ID"><Input value="" onChange={() => {}} placeholder="app registration id" mono /></Field>
                        <Field label="Redirect URI"><Input value="https://gateway/callback" onChange={() => {}} mono /></Field>
                        <Field label="Group mapping"><Input value="memberOf → role" onChange={() => {}} /></Field>
                      </>
                    )}
                    {p.id === 'ad' && (
                      <>
                        <Field label="LDAP host"><Input value="" onChange={() => {}} placeholder="ldaps://dc.corp:636" mono /></Field>
                        <Field label="Bind DN"><Input value="" onChange={() => {}} placeholder="CN=svc,OU=…" mono /></Field>
                        <Field label="Base DN"><Input value="" onChange={() => {}} placeholder="DC=corp,DC=local" mono /></Field>
                        <Field label="OU mapping"><Input value="OU → division" onChange={() => {}} /></Field>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}
