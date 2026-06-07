'use client';

/**
 * Proxy — local AI proxy management.
 *
 * Lets an org enable a 127.0.0.1-bound HTTP proxy and add named endpoints
 * that forward to configured provider accounts or virtual models.
 *
 * DB backing: proxy_settings + proxy_endpoints (migration 003).
 * Migration 005 adds target_type + virtual_model_id to proxy_endpoints.
 */

import { useState, useMemo, useEffect } from 'react';
import {
  PageHead, Btn, Modal, Field, Input, Select, Toggle, Notif,
} from '@/components/ui';
import { Section, Empty } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, updateResource, ApiError } from '@/lib/api/resources';
import type { ProxySettings, ProxyEndpoint, ProxyDialect, ProviderAccount, VirtualModel } from '@/lib/types';

/* ─── constants ──────────────────────────────────────────────────────────────── */

const DIALECT_OPTIONS: { value: ProxyDialect; label: string }[] = [
  { value: 'openai',    label: 'OpenAI (POST /v1/chat/completions)'                  },
  { value: 'anthropic', label: 'Anthropic (POST /v1/messages)'                       },
  { value: 'ollama',    label: 'Ollama (POST /api/chat)'                             },
  { value: 'azure',     label: 'Azure OpenAI (POST /openai/deployments/…)'           },
];

/** Colour for the provider-type chip in the endpoint row. */
const PROVIDER_TAG_COLOR: Record<string, string> = {
  openai:    '#0f62fe',
  anthropic: '#d2691e',
  azure:     '#0078d4',
  google:    '#4285f4',
  aws:       '#ff9900',
  mistral:   '#7c3aed',
  moonshot:  '#1e40af',
  qwen:      '#06b6d4',
  perplexity:'#6d28d9',
  ollama:    '#16a34a',
};

/* ─── form types ─────────────────────────────────────────────────────────────── */

interface EndpointForm {
  provider_account_id: string;
  virtual_model_id: string;
  target_type: 'provider_account' | 'virtual_model';
  dialect: ProxyDialect;
  port: string;
  session_ttl: string;
  name: string;
}

const emptyEndpointForm = (): EndpointForm => ({
  provider_account_id: '',
  virtual_model_id:    '',
  target_type:         'provider_account',
  dialect:             'openai',
  port:                '8080',
  session_ttl:         '30',
  name:                '',
});

/* ─── EndpointRow ────────────────────────────────────────────────────────────── */

function EndpointRow({
  endpoint, providerAccount, virtualModel, bindAddress, isLast, onEdit, onDelete,
}: {
  endpoint:        ProxyEndpoint;
  providerAccount: ProviderAccount | undefined;
  virtualModel:    VirtualModel | undefined;
  bindAddress:     string;
  isLast:          boolean;
  onEdit:          () => void;
  onDelete:        () => void;
}) {
  const isVirtualModel = endpoint.target_type === 'virtual_model' && virtualModel;
  const providerType   = providerAccount?.provider_type ?? endpoint.dialect;
  const tagColor       = PROVIDER_TAG_COLOR[providerType] ?? '#6b7280';

  const displayName = endpoint.name?.trim() || (
    isVirtualModel
      ? `${virtualModel.name} :${endpoint.port}`
      : `${providerAccount?.name?.trim() || providerType} :${endpoint.port}`
  );

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      {/* Provider type chip */}
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 7px', borderRadius: 3, fontSize: 11, fontWeight: 700,
        letterSpacing: '0.04em', color: '#fff',
        background: isVirtualModel ? '#6d28d9' : tagColor, flexShrink: 0,
      }}>
        {isVirtualModel ? 'VIRTUAL' : providerType.toUpperCase()}
      </span>

      {/* Name + URL */}
      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
        <div style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.3 }}>{displayName}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', marginTop: 1 }}>
          http://{bindAddress}:{endpoint.port}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
        <a
          href={`http://${bindAddress}:${endpoint.port}/health`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn ghost sm btn-icon-only"
          title={`Test: curl http://${bindAddress}:${endpoint.port}/health`}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="zap" size={14} />
        </a>
        <button
          className="btn ghost sm btn-icon-only"
          title="Edit endpoint"
          onClick={onEdit}
        >
          <Icon name="edit" size={14} />
        </button>
        <button
          className="btn ghost sm btn-icon-only"
          title="Remove endpoint"
          style={{ color: 'var(--text-danger, #e05252)' }}
          onClick={onDelete}
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── EndpointFormModal ──────────────────────────────────────────────────────── */

function EndpointFormModal({
  mode, endpoint, providerAccounts, virtualModels, existingEndpoints, orgId, onClose, onSaved,
}: {
  mode:              'add' | 'edit';
  endpoint?:         ProxyEndpoint;
  providerAccounts:  ProviderAccount[];
  virtualModels:     VirtualModel[];
  existingEndpoints: ProxyEndpoint[];
  orgId:             string | undefined;
  onClose:           () => void;
  onSaved:           () => void;
}) {
  const [form, setForm] = useState<EndpointForm>(() => ({
    provider_account_id: endpoint?.provider_account_id ?? '',
    virtual_model_id:    endpoint?.virtual_model_id    ?? '',
    target_type:         endpoint?.target_type         ?? 'provider_account',
    dialect:             endpoint?.dialect              ?? 'openai',
    port:                endpoint?.port != null         ? String(endpoint.port)        : '8080',
    session_ttl:         endpoint?.session_ttl != null  ? String(endpoint.session_ttl) : '30',
    name:                endpoint?.name                 ?? '',
  }));

  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof EndpointForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  /** When dialect changes away from ollama, reset target_type to provider_account. */
  function handleDialectChange(v: string) {
    setForm(f => ({
      ...f,
      dialect:          v as ProxyDialect,
      target_type:      v === 'ollama' ? f.target_type : 'provider_account',
      virtual_model_id: v === 'ollama' ? f.virtual_model_id : '',
    }));
  }

  // Client-side port uniqueness check (skip current endpoint in edit mode)
  const portNum = Number(form.port);
  const portConflict = form.port && existingEndpoints.some(
    e => e.is_active && Number(e.port) === portNum && e.id !== endpoint?.id
  );
  const portRangeError = form.port && (portNum < 1024 || portNum > 65535 || !Number.isInteger(portNum));
  const portError = portConflict
    ? `Port ${form.port} is already used by another endpoint.`
    : portRangeError
    ? 'Port must be an integer between 1024 and 65535.'
    : null;

  // Auto-derive a placeholder label from the selected target + port
  const isVirtualModelTarget = form.dialect === 'ollama' && form.target_type === 'virtual_model';
  const selectedProvider  = providerAccounts.find(a => a.id === form.provider_account_id);
  const selectedVm        = virtualModels.find(v => v.id === form.virtual_model_id);
  const namePlaceholder   = isVirtualModelTarget && selectedVm
    ? `${selectedVm.name} :${form.port || '8080'}`
    : selectedProvider
    ? `${selectedProvider.name || selectedProvider.provider_type} :${form.port || '8080'}`
    : `${DIALECT_OPTIONS.find(d => d.value === form.dialect)?.value ?? form.dialect} :${form.port || '8080'}`;

  async function handleSubmit() {
    if (mode === 'add' && !orgId) {
      setError('No organisation loaded — please wait and try again.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const effectiveTargetType = form.dialect === 'ollama' ? form.target_type : 'provider_account';
      const payload: Record<string, unknown> = {
        dialect:             form.dialect,
        port:                Number(form.port),
        session_ttl:         Number(form.session_ttl) || 30,
        name:                form.name.trim() || null,
        is_active:           true,
        target_type:         effectiveTargetType,
        provider_account_id: effectiveTargetType === 'provider_account'
          ? (form.provider_account_id || null)
          : null,
        virtual_model_id:    effectiveTargetType === 'virtual_model'
          ? (form.virtual_model_id || null)
          : null,
      };
      if (mode === 'add') {
        payload.org_id = orgId;
        await createResource<ProxyEndpoint>('proxy-endpoints', payload);
      } else {
        await updateResource<ProxyEndpoint>('proxy-endpoints', endpoint!.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = e.message.includes('unique') || e.message.includes('duplicate')
          ? `Port ${form.port} is already in use by another endpoint.`
          : e.message === 'store operation failed'
          ? 'Database error — make sure migrations 003 and 005 have been applied and the central server restarted.'
          : e.message;
        setError(msg);
      } else {
        setError('Save failed — check that the central server is running.');
      }
    } finally {
      setBusy(false);
    }
  }

  const canSave = !!form.port && !portError;

  return (
    <Modal
      title={mode === 'add' ? 'Add Endpoint' : 'Edit Endpoint'}
      label="Proxy"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" onClick={handleSubmit} disabled={busy || !canSave}>
            {busy ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      }
    >
      {error && <Notif kind="error" onClose={() => setError(null)}>{error}</Notif>}

      <Field
        label="Dialect"
        help="Determines the API format clients must use when talking to this endpoint."
      >
        <Select
          value={form.dialect}
          onChange={handleDialectChange}
          options={DIALECT_OPTIONS}
        />
      </Field>

      {/* Ollama-only: choose whether to route to a provider account or a virtual model */}
      {form.dialect === 'ollama' && (
        <Field
          label="Route to"
          help="Ollama endpoints can forward to a provider account or a virtual model (routing strategy)."
        >
          <div style={{ display: 'flex', gap: 24 }}>
            {(['provider_account', 'virtual_model'] as const).map(t => (
              <label
                key={t}
                style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}
              >
                <input
                  type="radio"
                  name="target_type"
                  value={t}
                  checked={form.target_type === t}
                  onChange={() => setForm(f => ({ ...f, target_type: t }))}
                  style={{ accentColor: 'var(--interactive-01, #0f62fe)' }}
                />
                {t === 'provider_account' ? 'Provider Account' : 'Virtual Model'}
              </label>
            ))}
          </div>
        </Field>
      )}

      {/* Provider Account OR Virtual Model dropdown — conditional on target_type */}
      {isVirtualModelTarget ? (
        <Field
          label="Virtual Model"
          help="Active virtual model to route this Ollama endpoint to."
        >
          <Select
            value={form.virtual_model_id}
            onChange={set('virtual_model_id')}
            options={[
              { value: '', label: 'Select a virtual model…' },
              ...virtualModels.map(vm => ({
                value: vm.id,
                label: vm.name,
              })),
            ]}
          />
        </Field>
      ) : (
        <Field
          label="Provider Account"
          help="Which upstream provider account this endpoint routes to."
        >
          <Select
            value={form.provider_account_id}
            onChange={set('provider_account_id')}
            options={[
              { value: '', label: 'None (unlinked)' },
              ...providerAccounts.map(a => ({
                value: a.id,
                label: `${a.provider_type.toUpperCase()} — ${a.name || a.slug}`,
              })),
            ]}
          />
        </Field>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Field label="Port" help="1024 – 65535" error={portError ?? undefined}>
          <Input
            type="number"
            value={form.port}
            onChange={set('port')}
            placeholder="8080"
            mono
          />
        </Field>
        <Field label="Session TTL (minutes)">
          <Input
            type="number"
            value={form.session_ttl}
            onChange={set('session_ttl')}
            placeholder="30"
          />
        </Field>
      </div>

      <Field label="Name / label" help="Optional. Defaults to provider name + port.">
        <Input
          value={form.name}
          onChange={set('name')}
          placeholder={namePlaceholder}
        />
      </Field>
    </Modal>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function ProxyPage() {
  const orgId = useDefaultOrgId();

  const { data: settingsList, mutate: reloadSettings } =
    useResourceList<ProxySettings>('proxy-settings', { limit: 1 });
  const { data: allEndpoints, mutate: reloadEndpoints } =
    useResourceList<ProxyEndpoint>('proxy-endpoints', { limit: 500 });
  const { data: allProviders } =
    useResourceList<ProviderAccount>('provider-accounts', { limit: 500 });
  const { data: allVirtualModels } =
    useResourceList<VirtualModel>('virtual-models', { limit: 500 });

  const settings            = settingsList[0] ?? null;
  const activeEndpoints     = useMemo(() => allEndpoints.filter(e => e.is_active), [allEndpoints]);
  const activeProviders     = useMemo(() => allProviders.filter(a => a.is_active), [allProviders]);
  const activeVirtualModels = useMemo(() => allVirtualModels.filter(v => v.is_active !== false), [allVirtualModels]);

  // Lookup maps
  const providerById = useMemo(() => {
    const m: Record<string, ProviderAccount> = {};
    for (const a of allProviders) m[a.id] = a;
    return m;
  }, [allProviders]);

  const virtualModelById = useMemo(() => {
    const m: Record<string, VirtualModel> = {};
    for (const v of allVirtualModels) m[v.id] = v;
    return m;
  }, [allVirtualModels]);

  const bindAddress = settings?.bind_address ?? '127.0.0.1';

  const [toggling,       setToggling]       = useState(false);
  const [toggleError,    setToggleError]     = useState<string | null>(null);
  const [nodeInput,      setNodeInput]       = useState('127.0.0.1');
  const [savingNode,     setSavingNode]      = useState(false);
  const [endpointModal,  setEndpointModal]   = useState<'add' | 'edit' | null>(null);
  const [endpointTarget, setEndpointTarget]  = useState<ProxyEndpoint | undefined>();

  // Sync editable node input once settings load from the API
  useEffect(() => {
    if (settings?.bind_address) setNodeInput(settings.bind_address);
  }, [settings?.bind_address]);

  async function handleSaveNode() {
    if (!orgId || !nodeInput.trim()) return;
    setSavingNode(true);
    try {
      if (!settings) {
        await createResource<ProxySettings>('proxy-settings', {
          org_id: orgId, is_enabled: false, bind_address: nodeInput.trim(),
        });
      } else {
        await updateResource<ProxySettings>('proxy-settings', settings.id, {
          bind_address: nodeInput.trim(),
        });
      }
      reloadSettings();
    } catch { /* non-blocking */ }
    finally { setSavingNode(false); }
  }

  async function handleToggle(enabled: boolean) {
    if (!orgId) return;
    setToggling(true);
    setToggleError(null);
    try {
      if (!settings) {
        await createResource<ProxySettings>('proxy-settings', { org_id: orgId, is_enabled: enabled });
      } else {
        await updateResource<ProxySettings>('proxy-settings', settings.id, { is_enabled: enabled });
      }
      reloadSettings();
    } catch (e) {
      setToggleError(
        e instanceof ApiError
          ? e.message === 'store operation failed'
            ? 'Database error — make sure migration 003 has been applied and the central server restarted.'
            : e.message
          : 'Failed to update proxy settings.'
      );
    } finally {
      setToggling(false);
    }
  }

  async function removeEndpoint(ep: ProxyEndpoint) {
    try {
      await updateResource<ProxyEndpoint>('proxy-endpoints', ep.id, { is_active: false });
      reloadEndpoints();
    } catch { /* non-blocking; card stays until next reload */ }
  }

  function openAddEndpoint() {
    setEndpointTarget(undefined);
    setEndpointModal('add');
  }

  function openEditEndpoint(ep: ProxyEndpoint) {
    setEndpointTarget(ep);
    setEndpointModal('edit');
  }

  const isEnabled = settings?.is_enabled ?? false;

  return (
    <div>
      <PageHead
        title="Proxy"
        sub="Route AI traffic through a local HTTP proxy. Each endpoint binds to a port on the configured worker node."
      />

      {/* ── Enable / disable card ── */}
      <Section style={{ paddingTop: 20 }}>
        <div className="tile" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top row: icon + label + toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-hover)', flexShrink: 0,
            }}>
              <Icon name="zap" size={20} />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Enable AI Proxy</div>
              <div style={{ fontSize: 13, color: 'var(--text-helper)', marginTop: 2 }}>
                Starts a local HTTP server so external tools can route through this app.
                Binds to the configured worker node address.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', display: 'inline-block',
                background: isEnabled ? 'var(--support-success, #24a148)' : 'var(--border-strong, #8d8d8d)',
                transition: 'background 0.2s',
              }} />
              <Toggle on={isEnabled} onChange={handleToggle} disabled={toggling} label="" />
            </div>
          </div>

          {/* Worker node address row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            paddingTop: 4, borderTop: '1px solid var(--border-subtle)',
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
              Worker Node
            </span>
            <input
              type="text"
              value={nodeInput}
              onChange={(e) => setNodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveNode()}
              placeholder="127.0.0.1"
              style={{
                flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13,
                border: '1px solid var(--border-strong)', borderRadius: 2,
                padding: '4px 8px', background: 'var(--field-bg, #f4f4f4)',
                color: 'var(--text-primary)',
              }}
            />
            <Btn kind="secondary" size="sm" onClick={handleSaveNode} disabled={savingNode || !nodeInput.trim()}>
              {savingNode ? 'Saving…' : 'Save'}
            </Btn>
          </div>
        </div>

        {toggleError && (
          <Notif kind="error" onClose={() => setToggleError(null)} style={{ marginTop: 8 }}>
            {toggleError}
          </Notif>
        )}
      </Section>

      {/* ── Endpoints ── */}
      <Section
        style={{ paddingTop: 24 }}
        title="Endpoints"
        right={
          <Btn kind="primary" size="sm" icon="add" onClick={openAddEndpoint}>
            Add Endpoint
          </Btn>
        }
      >
        {activeEndpoints.length === 0 ? (
          <Empty
            icon="plug"
            title="No endpoints configured"
            body="Add an endpoint to expose a provider account on a local port."
            action={
              <Btn kind="primary" size="sm" icon="add" onClick={openAddEndpoint}>
                Add Endpoint
              </Btn>
            }
          />
        ) : (
          <>
            <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>
              {activeEndpoints.map((ep, i) => (
                <EndpointRow
                  key={ep.id}
                  endpoint={ep}
                  providerAccount={ep.provider_account_id ? providerById[ep.provider_account_id] : undefined}
                  virtualModel={ep.virtual_model_id ? virtualModelById[ep.virtual_model_id] : undefined}
                  bindAddress={bindAddress}
                  isLast={i === activeEndpoints.length - 1}
                  onEdit={() => openEditEndpoint(ep)}
                  onDelete={() => removeEndpoint(ep)}
                />
              ))}
            </div>

          </>
        )}
      </Section>

      {/* ── Endpoint modal ── */}
      {endpointModal && (
        <EndpointFormModal
          mode={endpointModal}
          endpoint={endpointTarget}
          providerAccounts={activeProviders}
          virtualModels={activeVirtualModels}
          existingEndpoints={activeEndpoints}
          orgId={orgId}
          onClose={() => setEndpointModal(null)}
          onSaved={() => reloadEndpoints()}
        />
      )}
    </div>
  );
}
