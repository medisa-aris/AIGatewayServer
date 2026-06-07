'use client';

/**
 * Provider Accounts — full CRUD implementation.
 *
 * Shows 10 fixed provider-type widgets (one per supported upstream).
 * Clicking a widget reveals its models in the grid below.
 * Real HTTP connectivity checks run on mount and every 30 s.
 *
 * DB backing: provider_accounts table (migration 002).
 */

import { useState, useEffect, useCallback, useMemo, type CSSProperties } from 'react';
import {
  PageHead, Btn, Modal, Field, Input, Select, Toggle, Notif, Check,
  DataTable, Tag, type Column,
} from '@/components/ui';
import { Section, Empty } from '@/components/ui/screen';
import { ProviderLogo } from '@/components/Icon';
import { Icon } from '@/components/Icon';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, updateResource, ApiError } from '@/lib/api/resources';
import type { ProviderAccount, ProviderType, Model, Json } from '@/lib/types';

/* ─── provider slot registry ────────────────────────────────────────────────── */

interface ProviderSlot {
  type: ProviderType;
  label: string;
}

const PROVIDER_SLOTS: ProviderSlot[] = [
  { type: 'openai',      label: 'OpenAI'           },
  { type: 'anthropic',   label: 'Anthropic'         },
  { type: 'azure',       label: 'Azure OpenAI'      },
  { type: 'google',      label: 'Google Vertex AI'  },
  { type: 'aws',         label: 'AWS Bedrock'       },
  { type: 'mistral',     label: 'Mistral'           },
  { type: 'moonshot',    label: 'Moonshot (Kimi)'   },
  { type: 'qwen',        label: 'Qwen'              },
  { type: 'perplexity',  label: 'Perplexity'        },
  { type: 'ollama',      label: 'Ollama'            },
];

/* ─── helpers ────────────────────────────────────────────────────────────────── */

function fmtTokens(n: number | null | undefined): string {
  if (!n) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(0) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return String(n);
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ─── capability options ─────────────────────────────────────────────────────── */

const CAPABILITY_OPTIONS = [
  { value: 'streaming',        label: 'Streaming'        },
  { value: 'function_calling', label: 'Function Calling' },
  { value: 'json_mode',        label: 'JSON Mode'        },
  { value: 'vision',           label: 'Vision'           },
  { value: 'audio',            label: 'Audio'            },
  { value: 'reasoning',        label: 'Reasoning'        },
  { value: 'code',             label: 'Code Generation'  },
  { value: 'embedding',        label: 'Embedding'        },
  { value: 'fine_tuning',      label: 'Fine-tuning'      },
  { value: 'search',           label: 'Web Search'       },
  { value: 'video',            label: 'Video'            },
  { value: 'batch',            label: 'Batch API'        },
  { value: 'caching',          label: 'Prompt Caching'   },
];

/* ─── form state types ───────────────────────────────────────────────────────── */

interface ProviderForm {
  name: string;
  provider_type: ProviderType;
  api_key: string;          // blank on edit means "don't change"
  endpoint_url: string;
  region: string;
  resource_name: string;    // Azure: extra_config.resource_name
  api_version: string;      // Azure: extra_config.api_version
  project_id: string;       // Google: extra_config.project_id
  is_active: boolean;
}

interface ModelForm {
  model_id: string;
  name: string;
  modality: string;
  max_tokens: string;
  context_window: string;
  deployment_name: string;
  capabilities: string[];
  is_active: boolean;
}

const emptyProviderForm = (type: ProviderType = 'openai'): ProviderForm => ({
  name: '', provider_type: type, api_key: '',
  endpoint_url: '', region: 'us-east-1',
  resource_name: '', api_version: '2024-02-01', project_id: '',
  is_active: true,
});

const emptyModelForm = (): ModelForm => ({
  model_id: '', name: '', modality: 'text',
  max_tokens: '', context_window: '', deployment_name: '',
  capabilities: [], is_active: true,
});

/* ─── ProviderCard ───────────────────────────────────────────────────────────── */

interface ProviderCardProps {
  slot: ProviderSlot;
  account: ProviderAccount | undefined;
  modelCount: number;
  connected: boolean | undefined;
  pinging: boolean;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onConfigure: () => void;
}

function ProviderCard({
  slot, account, modelCount, connected, pinging,
  selected, onSelect, onEdit, onDelete, onConfigure,
}: ProviderCardProps) {
  const cardStyle: CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: 16, cursor: 'pointer',
    border: selected
      ? '2px solid var(--brand)'
      : '2px solid transparent',
    borderRadius: 2,
    transition: 'border-color 0.15s',
    outline: 'none',
  };

  const keyHint = useMemo(() => {
    if (!account) return null;
    if (account.provider_type === 'ollama') {
      if (!account.endpoint_url) return null;
      try { return new URL(account.endpoint_url).host; } catch { return account.endpoint_url.slice(0, 20); }
    }
    return account.api_key ?? null;   // already "...XXXX" from BFF
  }, [account]);

  // Display name: account name → slug fallback → slot label
  const displayName = account
    ? (account.name?.trim() || account.slug || slot.label)
    : slot.label;

  const handleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    onSelect();
  };

  return (
    <div className="tile" style={cardStyle} onClick={handleClick} tabIndex={0}>
      {/* Header row: logo + name + action buttons */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProviderLogo type={slot.type} size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>{displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-helper)' }}>
              {account
                ? (modelCount > 0 ? `${modelCount} model${modelCount === 1 ? '' : 's'}` : 'No models')
                : 'Not configured'}
            </div>
          </div>
        </div>
        {account && (
          <div style={{ display: 'flex', gap: 2, flexShrink: 0, marginTop: -2 }}>
            <button
              className="btn ghost sm btn-icon-only"
              title="Edit provider"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <Icon name="edit" size={14} />
            </button>
            <button
              className="btn ghost sm btn-icon-only"
              title="Deactivate provider"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              style={{ color: 'var(--text-danger, #e05252)' }}
            >
              <Icon name="delete" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Key hint or endpoint */}
      {account ? (
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {slot.type === 'ollama' ? '⚡ ' : '🔑 '}
          {keyHint ?? <span style={{ opacity: 0.5 }}>no key set</span>}
        </div>
      ) : null}

      {/* Status row — marginTop auto pins it to the bottom of every card */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        {account ? (
          pinging ? (
            <Tag color="gray" sm dot>checking…</Tag>
          ) : connected === true ? (
            <Tag color="green" sm dot pulse>connected</Tag>
          ) : (
            <Tag color="red" sm dot>offline</Tag>
          )
        ) : (
          <Btn kind="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onConfigure(); }}>
            Configure
          </Btn>
        )}
      </div>
    </div>
  );
}

/* ─── ProviderFormModal ──────────────────────────────────────────────────────── */

function ProviderFormModal({
  mode, account, prefillType, orgId, allAccounts,
  onClose, onSaved,
}: {
  mode: 'add' | 'edit';
  account?: ProviderAccount;
  prefillType?: ProviderType;
  orgId: string | undefined;
  allAccounts: ProviderAccount[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialType = account?.provider_type ?? prefillType ?? 'openai';
  const extra = (account?.extra_config ?? {}) as Record<string, string>;

  const [form, setForm] = useState<ProviderForm>(() => ({
    name:           account?.name           ?? '',
    provider_type:  initialType,
    api_key:        '',  // always blank; submit omits if blank
    endpoint_url:   account?.endpoint_url   ?? '',
    region:         account?.region         ?? 'us-east-1',
    resource_name:  extra.resource_name     ?? '',
    api_version:    extra.api_version       ?? '2024-02-01',
    project_id:     extra.project_id        ?? '',
    is_active:      account?.is_active      ?? true,
  }));

  const [busy,         setBusy]         = useState(false);
  const [error,        setError]        = useState<string | null>(null);
  // Holds a soft-deleted account that clashes with the slug we're about to create
  const [slugConflict, setSlugConflict] = useState<ProviderAccount | null>(null);

  const set = (k: keyof ProviderForm) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isOllama  = form.provider_type === 'ollama';
  const isAzure   = form.provider_type === 'azure';
  const isAws     = form.provider_type === 'aws';
  const isGoogle  = form.provider_type === 'google';

  function buildPayload(slug: string): Record<string, unknown> {
    const extra_config: Record<string, string> = {};
    if (isAzure) {
      if (form.resource_name) extra_config.resource_name = form.resource_name;
      if (form.api_version)   extra_config.api_version   = form.api_version;
    }
    if (isGoogle && form.project_id) extra_config.project_id = form.project_id;

    const payload: Record<string, unknown> = {
      name:          form.name,
      provider_type: form.provider_type,
      endpoint_url:  isOllama || isAzure ? (form.endpoint_url || null) : null,
      region:        isAws ? (form.region || null) : null,
      extra_config:  Object.keys(extra_config).length ? extra_config : {},
      is_active:     form.is_active,
    };

    if (mode === 'add') {
      payload.slug   = slug;
      payload.org_id = orgId;
      if (!isOllama && form.api_key) payload.api_key = form.api_key;
    } else {
      if (!isOllama && form.api_key.trim()) payload.api_key = form.api_key;
    }
    return payload;
  }

  // overrideSlug bypasses the conflict check (used by "Add as new" after conflict is shown)
  async function handleSubmit(overrideSlug?: string) {
    if (mode === 'add' && !orgId) {
      setError('No organisation loaded yet — please wait a moment and try again.');
      return;
    }

    const baseSlug = slugify(form.name) || `${form.provider_type}-${Date.now()}`;
    const slug     = overrideSlug ?? baseSlug;

    // Slug conflict check — only on add, only when not bypassed
    if (mode === 'add' && !overrideSlug) {
      const existing = allAccounts.find((a) => a.slug === slug);
      if (existing) {
        if (!existing.is_active) {
          // Soft-deleted account with the same slug — ask the user what to do
          setSlugConflict(existing);
          return;
        } else {
          setError(
            `An account named "${existing.name || existing.slug}" already exists. ` +
            `Please choose a different name.`
          );
          return;
        }
      }
    }

    setBusy(true);
    setError(null);
    setSlugConflict(null);
    try {
      const payload = buildPayload(slug);
      if (mode === 'add') {
        await createResource<ProviderAccount>('provider-accounts', payload);
      } else {
        await updateResource<ProviderAccount>('provider-accounts', account!.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const msg = e.message === 'store operation failed'
          ? 'Database error — make sure migration 002 has been applied and the central server restarted.'
          : e.message;
        setError(msg);
      } else {
        setError('Save failed — check that the central server is running.');
      }
    } finally {
      setBusy(false);
    }
  }

  // Re-enable a soft-deleted account instead of creating a new one
  async function reactivateExisting() {
    if (!slugConflict) return;
    setBusy(true);
    setError(null);
    try {
      await updateResource<ProviderAccount>('provider-accounts', slugConflict.id, { is_active: true });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to re-enable account.');
    } finally {
      setBusy(false);
    }
  }

  // Proceed with a timestamp-suffixed slug to avoid the unique constraint
  function handleAddAsNew() {
    const newSlug = `${slugify(form.name) || form.provider_type}-${Date.now()}`;
    handleSubmit(newSlug);
  }

  const keyPlaceholder = mode === 'edit' && account?.api_key
    ? `Current: ${account.api_key} — leave blank to keep`
    : 'Paste API key…';

  return (
    <Modal
      title={mode === 'add' ? `Configure ${PROVIDER_SLOTS.find(s => s.type === form.provider_type)?.label ?? 'Provider'}` : `Edit ${account?.name}`}
      label="Provider Account"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" onClick={() => handleSubmit()} disabled={busy || !form.name}>
            {busy ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      }
    >
      {error && <Notif kind="error" onClose={() => setError(null)}>{error}</Notif>}

      {/* Slug conflict — soft-deleted account with the same name exists */}
      {slugConflict && (
        <Notif kind="warning" onClose={() => setSlugConflict(null)}>
          <div>
            <strong>"{slugConflict.name || slugConflict.slug}"</strong> already exists but was deactivated.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <Btn kind="primary" size="sm" onClick={reactivateExisting} disabled={busy}>
              Re-enable existing
            </Btn>
            <Btn kind="secondary" size="sm" onClick={handleAddAsNew} disabled={busy}>
              Add as new
            </Btn>
          </div>
        </Notif>
      )}

      {mode === 'add' && (
        <Field label="Provider Type">
          <Select
            value={form.provider_type}
            onChange={(v) => set('provider_type')(v)}
            options={PROVIDER_SLOTS.map(s => ({ value: s.type, label: s.label }))}
          />
        </Field>
      )}

      <Field label="Account Name" help="Friendly label, e.g. 'Production OpenAI'">
        <Input
          value={form.name}
          onChange={set('name')}
          placeholder={`${PROVIDER_SLOTS.find(s => s.type === form.provider_type)?.label} (Production)`}
        />
      </Field>

      {/* API Key — not shown for Ollama */}
      {!isOllama && (
        <Field
          label="API Key"
          help={mode === 'edit' ? 'Leave blank to keep current key.' : undefined}
        >
          <Input
            type="password"
            value={form.api_key}
            onChange={set('api_key')}
            placeholder={keyPlaceholder}
            mono
          />
        </Field>
      )}

      {/* Endpoint URL — required for Ollama, optional for Azure */}
      {(isOllama || isAzure) && (
        <Field
          label={isOllama ? 'Endpoint URL' : 'Azure Endpoint URL'}
          help={isOllama ? 'e.g. http://localhost:11434' : 'e.g. https://<name>.openai.azure.com'}
        >
          <Input
            value={form.endpoint_url}
            onChange={set('endpoint_url')}
            placeholder={isOllama ? 'http://localhost:11434' : 'https://my-resource.openai.azure.com'}
            mono
          />
        </Field>
      )}

      {/* Azure extras */}
      {isAzure && (
        <>
          <Field label="Resource Name" help="The subdomain of your Azure endpoint (e.g. 'my-resource')">
            <Input value={form.resource_name} onChange={set('resource_name')} placeholder="my-resource" />
          </Field>
          <Field label="API Version" help="Azure OpenAI API version">
            <Input value={form.api_version} onChange={set('api_version')} placeholder="2024-02-01" mono />
          </Field>
        </>
      )}

      {/* AWS region */}
      {isAws && (
        <Field label="Region">
          <Select
            value={form.region}
            onChange={set('region')}
            options={[
              { value: 'us-east-1',      label: 'US East (N. Virginia)' },
              { value: 'us-west-2',      label: 'US West (Oregon)' },
              { value: 'eu-west-1',      label: 'EU (Ireland)' },
              { value: 'eu-central-1',   label: 'EU (Frankfurt)' },
              { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)' },
              { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)' },
            ]}
          />
        </Field>
      )}

      {/* Google Project ID */}
      {isGoogle && (
        <Field label="GCP Project ID" help="Optional — required for Vertex AI usage quotas">
          <Input value={form.project_id} onChange={set('project_id')} placeholder="my-gcp-project" />
        </Field>
      )}

      <Field label="Active">
        <Toggle on={form.is_active} onChange={set('is_active')} label={form.is_active ? 'Enabled' : 'Disabled'} />
      </Field>
    </Modal>
  );
}

/* ─── ModelFormModal ─────────────────────────────────────────────────────────── */

interface RemoteModel { id: string; name: string; }

function ModelFormModal({
  mode, model, providerAccount, orgId,
  onClose, onSaved,
}: {
  mode: 'add' | 'edit';
  model?: Model;
  providerAccount: ProviderAccount;
  orgId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ModelForm>(() => ({
    model_id:        model?.model_id        ?? '',
    name:            model?.name            ?? '',
    modality:        model?.modality        ?? 'text',
    max_tokens:      model?.max_tokens      != null ? String(model.max_tokens)      : '',
    context_window:  model?.context_window  != null ? String(model.context_window)  : '',
    deployment_name: model?.deployment_name ?? '',
    capabilities:    Array.isArray(model?.capabilities) ? (model.capabilities as string[]) : [],
    is_active:       model?.is_active ?? true,
  }));

  const [busy,          setBusy]          = useState(false);
  const [error,         setError]         = useState<string | null>(null);
  // Remote model list fetched from the provider API on mount (add mode only)
  const [remoteModels,  setRemoteModels]  = useState<RemoteModel[] | null>(null);
  const [loadingModels, setLoadingModels] = useState(mode === 'add');
  const [manualEntry,   setManualEntry]   = useState(false);

  // Fetch available models from the provider when the modal opens (add mode only)
  useEffect(() => {
    if (mode !== 'add') return;
    let cancelled = false;
    (async () => {
      try {
        const res  = await fetch(`/api/providers/${providerAccount.id}/models`);
        const data = (await res.json()) as { models: RemoteModel[]; error?: string };
        if (!cancelled) {
          setRemoteModels(data.models?.length ? data.models : null);
        }
      } catch {
        if (!cancelled) setRemoteModels(null);
      } finally {
        if (!cancelled) setLoadingModels(false);
      }
    })();
    return () => { cancelled = true; };
  }, [mode, providerAccount.id]);

  const set = (k: keyof ModelForm) => (v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  function selectRemoteModel(id: string) {
    const m = remoteModels?.find((r) => r.id === id);
    setForm((f) => ({
      ...f,
      model_id: id,
      // Auto-fill display name only if it hasn't been touched
      name: f.name || (m && m.name !== m.id ? m.name : id),
    }));
  }

  function toggleCapability(value: string) {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(value)
        ? f.capabilities.filter((c) => c !== value)
        : [...f.capabilities, value],
    }));
  }

  async function handleSubmit() {
    setBusy(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        model_id:        form.model_id.trim(),
        name:            form.name.trim(),
        modality:        form.modality,
        max_tokens:      form.max_tokens      ? Number(form.max_tokens)      : null,
        context_window:  form.context_window  ? Number(form.context_window)  : null,
        deployment_name: form.deployment_name || null,
        capabilities:    form.capabilities.length ? form.capabilities : null,
        is_active:       form.is_active,
      };

      if (mode === 'add') {
        payload.provider_id = providerAccount.id;
        payload.org_id      = orgId;
        await createResource<Model>('models', payload);
      } else {
        await updateResource<Model>('models', model!.id, payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  const isAzure     = providerAccount.provider_type === 'azure';
  const showDropdown = mode === 'add' && !manualEntry && remoteModels && remoteModels.length > 0;

  return (
    <Modal
      title={mode === 'add' ? 'Add Model' : `Edit ${model?.name ?? 'Model'}`}
      label={providerAccount.name}
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" onClick={handleSubmit} disabled={busy || !form.model_id || !form.name}>
            {busy ? 'Saving…' : 'Save'}
          </Btn>
        </div>
      }
    >
      {error && <Notif kind="error" onClose={() => setError(null)}>{error}</Notif>}

      {/* Model ID — dropdown from provider API (add mode) or text input (edit / fallback) */}
      <Field
        label="Model"
        help={showDropdown ? 'Models fetched live from your provider account.' : 'Provider\'s canonical model identifier.'}
      >
        {loadingModels ? (
          <div style={{ fontSize: 13, color: 'var(--text-helper)', padding: '8px 0' }}>
            Fetching available models from provider…
          </div>
        ) : showDropdown ? (
          <>
            <Select
              value={form.model_id}
              onChange={selectRemoteModel}
              options={[
                { value: '', label: 'Select a model…' },
                ...remoteModels!.map((m) => ({
                  value: m.id,
                  label: m.name !== m.id ? `${m.name}  (${m.id})` : m.id,
                })),
              ]}
            />
            <button
              type="button"
              style={{ fontSize: 11, color: 'var(--brand)', marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onClick={() => setManualEntry(true)}
            >
              Enter model ID manually instead
            </button>
          </>
        ) : (
          <>
            <Input value={form.model_id} onChange={set('model_id')} placeholder="gpt-4o" mono />
            {mode === 'add' && remoteModels && remoteModels.length > 0 && (
              <button
                type="button"
                style={{ fontSize: 11, color: 'var(--brand)', marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onClick={() => setManualEntry(false)}
              >
                ← Back to model list
              </button>
            )}
            {mode === 'add' && !loadingModels && !remoteModels && (
              <div style={{ fontSize: 11, color: 'var(--text-helper)', marginTop: 6 }}>
                Could not fetch models from provider — enter the model ID manually.
              </div>
            )}
          </>
        )}
      </Field>

      <Field label="Display Name">
        <Input value={form.name} onChange={set('name')} placeholder="GPT-4o" />
      </Field>

      <Field label="Modality">
        <Select
          value={form.modality}
          onChange={set('modality')}
          options={[
            { value: 'text',        label: 'Text' },
            { value: 'embedding',   label: 'Embedding' },
            { value: 'image',       label: 'Image' },
            { value: 'audio',       label: 'Audio' },
            { value: 'multimodal',  label: 'Multimodal' },
          ]}
        />
      </Field>

      <Field
        label="Context Window (tokens)"
        help="Total tokens the model can process (input + output combined)."
      >
        <Input
          type="number"
          value={form.context_window}
          onChange={set('context_window')}
          placeholder="128000"
        />
      </Field>

      <Field
        label="Max Output Tokens"
        help="Maximum number of tokens the model generates per request."
      >
        <Input
          type="number"
          value={form.max_tokens}
          onChange={set('max_tokens')}
          placeholder="4096"
        />
      </Field>

      <Field
        label="Deployment Name"
        help={isAzure
          ? 'Azure deployment alias — may differ from Model ID (e.g. my-gpt4 vs gpt-4o).'
          : 'Optional. Used by some providers to distinguish deployments.'}
      >
        <Input
          value={form.deployment_name}
          onChange={set('deployment_name')}
          placeholder={isAzure ? 'my-gpt4-deployment' : 'optional'}
          mono
        />
      </Field>

      <Field label="Capabilities" help="Select all features this model supports.">
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '10px 24px',
          paddingTop: 4,
        }}>
          {CAPABILITY_OPTIONS.map(({ value, label }) => (
            <label
              key={value}
              style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}
            >
              <Check
                checked={form.capabilities.includes(value)}
                onChange={() => toggleCapability(value)}
              />
              <span style={{ fontSize: 13 }}>{label}</span>
            </label>
          ))}
        </div>
      </Field>

      <Field label="Active">
        <Toggle on={form.is_active} onChange={set('is_active')} label={form.is_active ? 'Active' : 'Inactive'} />
      </Field>
    </Modal>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────────── */

export default function ProvidersPage() {
  const orgId = useDefaultOrgId();
  const { data: accounts, mutate: reloadAccounts } = useResourceList<ProviderAccount>('provider-accounts', { limit: 500 });
  const { data: allModels, mutate: reloadModels }   = useResourceList<Model>('models', { limit: 500 });

  // Only show active accounts in the widget grid (soft-deleted are hidden)
  const activeAccounts = useMemo(
    () => accounts.filter((a) => a.is_active),
    [accounts],
  );

  // Connectivity state per account id
  const [pingResults, setPingResults] = useState<Record<string, boolean>>({});
  const [pinging,     setPinging]     = useState<Record<string, boolean>>({});

  // Selection — one account at a time
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  const selectedAccount = useMemo(
    () => activeAccounts.find((a) => a.id === selectedAccountId) ?? null,
    [activeAccounts, selectedAccountId],
  );

  // Provider modal
  const [providerModal, setProviderModal]   = useState<'add' | 'edit' | null>(null);
  const [providerTarget, setProviderTarget] = useState<ProviderAccount | undefined>();
  const [prefillType,    setPrefillType]    = useState<ProviderType>('openai');

  // Model modal
  const [modelModal,   setModelModal]   = useState<'add' | 'edit' | null>(null);
  const [modelTarget,  setModelTarget]  = useState<Model | undefined>();

  // Models filtered by selected account
  const visibleModels = useMemo(
    () => selectedAccount ? allModels.filter((m) => m.provider_id === selectedAccount.id) : [],
    [allModels, selectedAccount],
  );

  // Model count per provider account id
  const modelCountById = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of allModels) {
      if (m.provider_id) counts[m.provider_id] = (counts[m.provider_id] ?? 0) + 1;
    }
    return counts;
  }, [allModels]);

  // Ping a single account
  const pingOne = useCallback(async (acc: ProviderAccount) => {
    setPinging((p) => ({ ...p, [acc.id]: true }));
    try {
      const res  = await fetch(`/api/providers/${acc.id}/ping`);
      const data = (await res.json()) as { connected: boolean };
      setPingResults((r) => ({ ...r, [acc.id]: data.connected }));
    } catch {
      setPingResults((r) => ({ ...r, [acc.id]: false }));
    } finally {
      setPinging((p) => ({ ...p, [acc.id]: false }));
    }
  }, []);

  // Ping all active accounts; refresh every 30 s
  const pingAll = useCallback(
    (list: ProviderAccount[]) => { list.forEach(pingOne); },
    [pingOne],
  );

  const activeIds = activeAccounts.map((a) => a.id).join(',');
  useEffect(() => {
    if (!activeAccounts.length) return;
    pingAll(activeAccounts);
    const t = setInterval(() => pingAll(activeAccounts), 30_000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds]);

  // Soft delete — sets is_active: false, clears selection if deleted account was selected
  async function softDeleteAccount(acc: ProviderAccount) {
    try {
      await updateResource<ProviderAccount>('provider-accounts', acc.id, { is_active: false });
      if (selectedAccountId === acc.id) setSelectedAccountId(null);
      reloadAccounts();
    } catch {
      // non-blocking; the account card stays visible until reload
    }
  }

  // Model grid columns
  const modelColumns: Column<Model & Record<string, unknown>>[] = [
    { key: 'model_id',        label: 'Model ID',      mono: true, width: '22%' },
    { key: 'name',            label: 'Name',          width: '18%' },
    { key: 'modality',        label: 'Modality',      width: '10%' },
    {
      key: 'context_window',
      label: 'Context',
      width: '8%',
      align: 'right',
      render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTokens(r.context_window as number)}</span>,
    },
    {
      key: 'max_tokens',
      label: 'Max Out',
      width: '8%',
      align: 'right',
      render: (r) => <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtTokens(r.max_tokens as number)}</span>,
    },
    {
      key: 'is_active',
      label: 'Status',
      width: '9%',
      render: (r) => (
        <Tag color={r.is_active ? 'green' : 'gray'} sm dot>
          {r.is_active ? 'active' : 'inactive'}
        </Tag>
      ),
    },
    {
      key: 'deployment_name',
      label: 'Deployment',
      width: '15%',
      render: (r) => r.deployment_name
        ? <span className="mono" style={{ fontSize: 12 }}>{r.deployment_name as string}</span>
        : <span style={{ color: 'var(--text-placeholder)' }}>—</span>,
    },
  ];

  function openEditProvider(acc: ProviderAccount) {
    setProviderTarget(acc);
    setProviderModal('edit');
  }

  function openConfigureProvider(type: ProviderType) {
    setProviderTarget(undefined);
    setPrefillType(type);
    setProviderModal('add');
  }

  function openAddProvider() {
    setProviderTarget(undefined);
    setPrefillType('openai');
    setProviderModal('add');
  }

  function openEditModel(m: Model) {
    setModelTarget(m);
    setModelModal('edit');
  }

  function openAddModel() {
    if (!selectedAccount) return;
    setModelTarget(undefined);
    setModelModal('add');
  }

  // Section title for the model grid
  const modelSectionTitle = selectedAccount
    ? `Models — ${selectedAccount.name?.trim() || selectedAccount.slug}`
    : 'Models';

  return (
    <div>
      <PageHead
        title="Provider Accounts"
        sub="Configure upstream AI provider credentials. Click a provider to view and manage its models."
        actions={
          <Btn kind="primary" size="sm" icon="add" onClick={openAddProvider}>
            Add Provider
          </Btn>
        }
      />

      {/* ── Provider widget grid ── */}
      <Section style={{ paddingTop: 20 }}>
        {activeAccounts.length === 0 ? (
          <Empty
            icon="model"
            title="No provider accounts"
            body="Add your first provider account to start routing AI traffic."
            action={
              <Btn kind="primary" size="sm" icon="add" onClick={openAddProvider}>
                Add Provider
              </Btn>
            }
          />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 12,
            }}
          >
            {activeAccounts.map((acc) => {
              const slot = PROVIDER_SLOTS.find((s) => s.type === acc.provider_type)
                ?? { type: acc.provider_type, label: acc.provider_type };
              return (
                <ProviderCard
                  key={acc.id}
                  slot={slot}
                  account={acc}
                  modelCount={modelCountById[acc.id] ?? 0}
                  connected={pingResults[acc.id]}
                  pinging={pinging[acc.id] ?? false}
                  selected={selectedAccountId === acc.id}
                  onSelect={() => setSelectedAccountId(acc.id)}
                  onEdit={() => openEditProvider(acc)}
                  onDelete={() => softDeleteAccount(acc)}
                  onConfigure={() => {}}
                />
              );
            })}
          </div>
        )}
      </Section>

      {/* ── Model grid ── */}
      <Section
        style={{ paddingTop: 28 }}
        title={modelSectionTitle}
        right={
          <Btn
            kind="primary"
            size="sm"
            icon="add"
            disabled={!selectedAccount}
            onClick={openAddModel}
          >
            Add Model
          </Btn>
        }
      >
        {!selectedAccount ? (
          <Empty
            icon="model"
            title="No provider selected"
            body="Select one of the provider widgets above to view and manage its models."
          />
        ) : visibleModels.length === 0 ? (
          <Empty
            icon="model"
            title="No models configured"
            body={`No models are linked to ${selectedAccount.name?.trim() || selectedAccount.slug} yet.`}
            action={
              <Btn kind="primary" size="sm" icon="add" onClick={openAddModel}>
                Add First Model
              </Btn>
            }
          />
        ) : (
          <DataTable<Model & Record<string, unknown>>
            columns={modelColumns}
            rows={visibleModels as (Model & Record<string, unknown>)[]}
            getKey={(r) => r.id}
            compact
            rowActions={(r) => (
              <button
                className="btn ghost sm btn-icon-only"
                title="Edit model"
                onClick={() => openEditModel(r as unknown as Model)}
              >
                <Icon name="edit" size={14} />
              </button>
            )}
          />
        )}
      </Section>

      {/* ── Provider form modal ── */}
      {providerModal && (
        <ProviderFormModal
          mode={providerModal}
          account={providerTarget}
          prefillType={prefillType}
          orgId={orgId}
          allAccounts={accounts}
          onClose={() => setProviderModal(null)}
          onSaved={() => reloadAccounts()}
        />
      )}

      {/* ── Model form modal ── */}
      {modelModal && selectedAccount && (
        <ModelFormModal
          mode={modelModal}
          model={modelTarget}
          providerAccount={selectedAccount}
          orgId={orgId}
          onClose={() => setModelModal(null)}
          onSaved={() => reloadModels()}
        />
      )}
    </div>
  );
}
