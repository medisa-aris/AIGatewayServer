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

import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  PageHead, Btn, Modal, Field, Input, Select, Toggle, Notif, Tabs,
} from '@/components/ui';
import { Section, Empty } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, updateResource, ApiError } from '@/lib/api/resources';
import type {
  ProxySettings, ProxyEndpoint, ProxyDialect, ProviderAccount, VirtualModel,
  McpServer, Model, RouteTestCheck,
} from '@/lib/types';

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

type TestStatus = 'idle' | 'checking' | 'ok' | 'fail';

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
  const [testStatus, setTestStatus] = useState<TestStatus>('idle');

  const isVirtualModel = endpoint.target_type === 'virtual_model' && virtualModel;
  const providerType   = providerAccount?.provider_type ?? endpoint.dialect;
  const tagColor       = PROVIDER_TAG_COLOR[providerType] ?? '#6b7280';

  const displayName = endpoint.name?.trim() || (
    isVirtualModel
      ? `${virtualModel.name} :${endpoint.port}`
      : `${providerAccount?.name?.trim() || providerType} :${endpoint.port}`
  );

  const handleTest = useCallback(async () => {
    setTestStatus('checking');
    try {
      const url = `http://${bindAddress}:${endpoint.port}/health`;
      const res  = await fetch(
        `/api/proxy-test?url=${encodeURIComponent(url)}`,
        { signal: AbortSignal.timeout(6000) },
      );
      const json = (await res.json()) as { ok: boolean; status: number };
      setTestStatus(json.ok ? 'ok' : 'fail');
    } catch {
      setTestStatus('fail');
    }
    setTimeout(() => setTestStatus('idle'), 3000);
  }, [bindAddress, endpoint.port]);

  const testDotColor =
    testStatus === 'ok'       ? 'var(--support-success, #24a148)' :
    testStatus === 'fail'     ? 'var(--support-error,   #da1e28)' :
    testStatus === 'checking' ? 'var(--support-warning, #f1c21b)' :
    'transparent';

  const testTitle =
    testStatus === 'checking' ? 'Checking reachability…' :
    testStatus === 'ok'       ? 'Reachable (2xx)' :
    testStatus === 'fail'     ? 'Unreachable or non-2xx' :
    `Test: GET http://${bindAddress}:${endpoint.port}/health`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 16px',
      borderBottom: isLast ? 'none' : '1px solid var(--border-subtle)',
    }}>
      {/* Provider type chip */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 80, padding: '2px 7px', borderRadius: 3, fontSize: 11, fontWeight: 700,
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {/* Reachability status dot (visible while checking / after result) */}
        {testStatus !== 'idle' && (
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: testDotColor,
            flexShrink: 0,
            transition: 'background 0.2s',
          }} />
        )}
        <button
          className="btn ghost sm btn-icon-only"
          title={testTitle}
          disabled={testStatus === 'checking'}
          onClick={handleTest}
        >
          <Icon name="zap" size={14} />
        </button>
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

      {/* ── Panel: Provider Dialect ── */}
      <div style={{
        marginTop: 4,
        padding: '14px 14px 10px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        background: 'var(--layer-01, #f4f4f4)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-secondary)',
          marginBottom: -4,
        }}>
          Provider Dialect
        </div>

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
      </div>

      {/* ── Panel: Provider Account ── */}
      <div style={{
        padding: '14px 14px 10px',
        border: '1px solid var(--border-subtle)',
        borderRadius: 4,
        background: 'var(--layer-01, #f4f4f4)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: 'var(--text-secondary)',
          marginBottom: -4,
        }}>
          Provider Account
        </div>

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
      </div>

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

/* ─── ProxyTestingPane ───────────────────────────────────────────────────────── */

interface RouteRequestResult {
  route_log_id: string;
  request_id:   string;
  allowed:       boolean;
  status:        string;
  output?:       string;
  checks:        RouteTestCheck[];
  prompt_tokens:     number;
  completion_tokens: number;
  cost:          number;
  latency_ms:    number;
  error_message?: string;
}

const TRACE_STATUS_COLOR: Record<string, string> = {
  pass: '#24a148', fail: '#da1e28', warn: '#f1c21b', skip: '#8d8d8d',
};
const TRACE_STATUS_ICON: Record<string, string> = {
  pass: 'checkmarkFill', fail: 'error', warn: 'warningAlt', skip: 'info',
};
const TRACE_STEP_LABEL: Record<string, string> = {
  resolve_user:     'Resolve user',
  endpoint_access:  'Endpoint access',
  mcp_access:       'MCP server access',
  skill_access:     'Skill access',
  guardrail_pii:    'PII guardrail',
  guardrail_budget: 'Budget guardrail',
  guardrail_rate:   'Rate limit',
};

function TestTraceRow({ check }: { check: RouteTestCheck }) {
  const [open, setOpen] = useState(false);
  const color = TRACE_STATUS_COLOR[check.status] ?? '#8d8d8d';
  const icon  = TRACE_STATUS_ICON[check.status]  ?? 'info';
  const label = TRACE_STEP_LABEL[check.step]     ?? check.step;
  return (
    <div
      style={{ borderBottom: '1px solid var(--border-subtle)', padding: '8px 0', cursor: check.details ? 'pointer' : 'default' }}
      onClick={() => check.details && setOpen(v => !v)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={14} style={{ color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', minWidth: 140 }}>{label}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
          background: color + '22', color, letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>{check.status}</span>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }}>{check.message}</span>
        {check.details && <Icon name={open ? 'chevronUp' : 'chevronDown'} size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
      </div>
      {open && check.details && (
        <pre style={{
          margin: '6px 0 0', padding: '8px 10px', borderRadius: 2,
          background: 'var(--layer-02, #e8e8e8)', fontSize: 11, lineHeight: 1.55,
          color: 'var(--text-primary)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {JSON.stringify(check.details, null, 2)}
        </pre>
      )}
    </div>
  );
}

function ProxyTestingPane({ allEps }: { allEps: ProxyEndpoint[] }) {
  const [apiKey,     setApiKey]     = useState('');
  const [message,    setMessage]    = useState('');
  const [endpointId, setEndpointId] = useState('');
  const [modelId,    setModelId]    = useState('');
  const [mcpId,      setMcpId]      = useState('');
  const [loading,    setLoading]    = useState(false);
  const [result,     setResult]     = useState<RouteRequestResult | null>(null);
  const [runError,   setRunError]   = useState<string | null>(null);
  const [traceOpen,  setTraceOpen]  = useState(false);

  const { data: rawMcps } = useResourceList<McpServer>('mcp-servers', { limit: 500 });
  const activeMcps = rawMcps.filter(m => m.is_active);

  const selectedEp       = allEps.find(ep => ep.id === endpointId) ?? null;
  const providerAccountId = selectedEp?.provider_account_id ?? '';

  const { data: rawModels } = useResourceList<Model>(
    'models',
    providerAccountId ? { provider_id: providerAccountId, limit: '100' } : { limit: '1' },
  );
  const availableModels = providerAccountId ? rawModels.filter(m => m.is_active) : [];

  function handleEndpointChange(id: string) {
    setEndpointId(id);
    setModelId('');
  }

  async function run() {
    if (!apiKey.trim() || !endpointId) return;
    setLoading(true);
    setRunError(null);
    setResult(null);
    setTraceOpen(false);
    try {
      const res = await fetch('/api/route-request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey:      apiKey.trim(),
          message,
          endpointId,
          mcpServerId: mcpId || undefined,
        }),
      });
      const json = await res.json() as RouteRequestResult | { error?: string };
      if (!res.ok) {
        setRunError((json as { error?: string }).error ?? `Error ${res.status}`);
      } else {
        setResult(json as RouteRequestResult);
      }
    } catch (e) {
      setRunError(String(e));
    } finally {
      setLoading(false);
    }
  }

  // Derive transaction log rows from the result (no extra DB fetch needed)
  const txLog = result ? (() => {
    const piiWarnCount = result.checks.filter(c => c.step === 'guardrail_pii' && c.status === 'warn').length;
    const blocked = result.status === 'blocked';
    return [
      { table: 'route_logs',           alias: 'log',       count: 1,                                           id: result.route_log_id },
      { table: 'request_logs',         alias: 'request',   count: blocked ? 0 : 1,                             id: result.request_id   },
      { table: 'budget_consumptions',  alias: 'budget',    count: !blocked && Number(result.cost) > 0 ? 1 : 0, id: null                },
      { table: 'guardrail_violations', alias: 'violation', count: piiWarnCount,                                id: null                },
    ];
  })() : null;

  const statusBg    = result?.status === 'allowed' ? '#defbe6' : result?.status === 'blocked' ? '#fff1f1' : '#fef4e4';
  const statusBdr   = result?.status === 'allowed' ? '#24a148' : result?.status === 'blocked' ? '#da1e28'  : '#f1c21b';
  const statusIcon  = result?.status === 'allowed' ? 'checkmarkFill' : result?.status === 'blocked' ? 'error' : 'warningAlt';
  const statusLabel = result?.status === 'allowed'
    ? 'Request allowed — provider responded'
    : result?.status === 'blocked'
    ? 'Request blocked by guardrails'
    : 'Provider error';

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'var(--text-secondary)',
    display: 'block', marginBottom: 4,
  };
  const selectStyle: React.CSSProperties = {
    width: '100%', fontSize: 13, padding: '6px 8px',
    border: '1px solid var(--border-strong)', borderRadius: 2,
    background: 'var(--field-bg, white)', color: 'var(--text-primary)',
    boxSizing: 'border-box',
  };

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '340px 1fr',
      border: '1px solid var(--border-subtle)', borderRadius: 4,
      overflow: 'hidden', minHeight: 560,
    }}>
      {/* ── Left pane: inputs ── */}
      <div style={{
        borderRight: '1px solid var(--border-subtle)',
        padding: 20, overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 16,
        background: 'var(--layer-02, white)',
      }}>
        {/* API Key */}
        <div>
          <label style={fieldLabelStyle}>
            API Key <span style={{ color: '#da1e28' }}>*</span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-…  or raw API key"
            style={selectStyle}
          />
          <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Used to authenticate the routed request against the gateway.
          </p>
        </div>

        {/* Message */}
        <div>
          <label style={fieldLabelStyle}>Message</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Enter your prompt…"
            rows={5}
            style={{ ...selectStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {/* Proxy Endpoint */}
        <div>
          <label style={fieldLabelStyle}>
            Proxy Endpoint <span style={{ color: '#da1e28' }}>*</span>
          </label>
          <select value={endpointId} onChange={e => handleEndpointChange(e.target.value)} style={selectStyle}>
            <option value="">— Select an endpoint —</option>
            {allEps.map(ep => (
              <option key={ep.id} value={ep.id}>
                {ep.name?.trim() || `${ep.dialect.toUpperCase()} :${ep.port}`}
              </option>
            ))}
          </select>
        </div>

        {/* Model — only when endpoint has a provider account with models */}
        {endpointId && availableModels.length > 0 && (
          <div>
            <label style={fieldLabelStyle}>Model</label>
            <select value={modelId} onChange={e => setModelId(e.target.value)} style={selectStyle}>
              <option value="">— Default (from provider config) —</option>
              {availableModels.map(m => (
                <option key={m.id} value={m.model_id}>{m.name || m.model_id}</option>
              ))}
            </select>
          </div>
        )}

        {/* MCP Server */}
        <div>
          <label style={fieldLabelStyle}>MCP Server</label>
          <select value={mcpId} onChange={e => setMcpId(e.target.value)} style={selectStyle}>
            <option value="">— None —</option>
            {activeMcps.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <button
          onClick={run}
          disabled={loading || !apiKey.trim() || !endpointId}
          style={{
            marginTop: 4,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: '9px 16px', fontSize: 13, fontWeight: 600,
            background: loading || !apiKey.trim() || !endpointId
              ? 'var(--interactive-03, #8d8d8d)'
              : 'var(--interactive-01, #0f62fe)',
            color: 'white', border: 'none', borderRadius: 2,
            cursor: loading || !apiKey.trim() || !endpointId ? 'not-allowed' : 'pointer',
          }}
        >
          <Icon name={loading ? 'refresh' : 'play'} size={13} />
          {loading ? 'Running…' : 'Run'}
        </button>
      </div>

      {/* ── Right pane: results ── */}
      <div style={{
        padding: '20px 24px', overflowY: 'auto',
        display: 'flex', flexDirection: 'column', gap: 16,
        background: 'var(--layer-01, #f4f4f4)',
      }}>
        {/* Idle state */}
        {!result && !runError && !loading && (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 10,
            color: 'var(--text-placeholder)',
          }}>
            <Icon name="route" size={40} style={{ opacity: 0.2 }} />
            <span style={{ fontSize: 13 }}>Enter an API key and endpoint, then click Run</span>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', gap: 8, fontSize: 13,
          }}>
            <Icon name="refresh" size={16} style={{ color: 'var(--interactive-01, #0f62fe)' }} />
            Routing request to provider…
          </div>
        )}

        {/* Error */}
        {runError && !loading && (
          <div style={{
            padding: '12px 14px', borderRadius: 2,
            background: '#fff1f1', border: '1px solid #da1e28', color: '#da1e28', fontSize: 13,
          }}>
            <Icon name="error" size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {runError}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <>
            {/* 1. Status banner */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 2,
              background: statusBg, border: `1px solid ${statusBdr}`,
            }}>
              <Icon name={statusIcon} size={16} style={{ color: statusBdr, flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: statusBdr }}>{statusLabel}</div>
                {result.error_message && (
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {result.error_message}
                  </div>
                )}
              </div>
            </div>

            {/* 2. Output */}
            {result.output && (
              <div>
                <div style={{ ...fieldLabelStyle, marginBottom: 6 }}>Response</div>
                <pre style={{
                  padding: '12px 14px', borderRadius: 2,
                  background: 'var(--layer-02, #e8e8e8)',
                  fontSize: 12, lineHeight: 1.6,
                  color: 'var(--text-primary)', whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', margin: 0,
                  fontFamily: 'var(--font-mono)',
                  maxHeight: 280, overflowY: 'auto',
                }}>
                  {result.output}
                </pre>
              </div>
            )}

            {/* 3. Stats row */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['Prompt tokens',     String(result.prompt_tokens)],
                ['Completion tokens', String(result.completion_tokens)],
                ['Cost',              `$${Number(result.cost).toFixed(6)}`],
                ['Latency',           `${result.latency_ms} ms`],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                  padding: '6px 12px', borderRadius: 3,
                  background: 'var(--layer-02, #e8e8e8)',
                  border: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                    {label}
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* 4. Pipeline Trace (collapsible) */}
            <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 2 }}>
              <button
                onClick={() => setTraceOpen(v => !v)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', background: 'none', border: 'none',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                <span>Pipeline Trace ({result.checks.length} steps)</span>
                <Icon name={traceOpen ? 'chevronUp' : 'chevronDown'} size={12} />
              </button>
              {traceOpen && (
                <div style={{ padding: '4px 12px 8px' }}>
                  {result.checks.map((check, i) => <TestTraceRow key={i} check={check} />)}
                </div>
              )}
            </div>

            {/* 5. Transaction Log */}
            {txLog && (
              <div>
                <div style={{ ...fieldLabelStyle, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  Transaction Log
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 10,
                    background: 'var(--tag-background, #e0e0e0)', color: 'var(--text-secondary)',
                    letterSpacing: '0.06em', textTransform: 'uppercase',
                  }}>log</span>
                </div>
                <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                  {/* Header */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1.4fr 80px 60px 1fr',
                    padding: '6px 12px',
                    background: 'var(--layer-02, #e8e8e8)',
                    borderBottom: '1px solid var(--border-subtle)',
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '0.06em', color: 'var(--text-secondary)',
                  }}>
                    <span>Table</span><span>Alias</span>
                    <span style={{ textAlign: 'center' }}>Rows</span>
                    <span>Record ID</span>
                  </div>
                  {txLog.map((row, i) => (
                    <div key={row.table} style={{
                      display: 'grid', gridTemplateColumns: '1.4fr 80px 60px 1fr',
                      padding: '7px 12px',
                      borderBottom: i < txLog.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                      fontSize: 12, alignItems: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                        {row.table}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--interactive-01, #0f62fe)' }}>
                        {row.alias}
                      </span>
                      <span style={{
                        textAlign: 'center', fontWeight: 700,
                        color: row.count > 0 ? 'var(--support-success, #24a148)' : 'var(--text-secondary)',
                      }}>
                        {row.count}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {row.id ? (
                          <a href="/route-logs" style={{ color: 'var(--interactive-01, #0f62fe)', textDecoration: 'none' }} title={row.id}>
                            {row.id.slice(0, 8)}…
                          </a>
                        ) : row.count > 0 ? '—' : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
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
      // Signal the central server to reconcile proxy listeners immediately.
      // Best-effort — if it fails the manager picks up the change within 3 s.
      fetch('/api/v1/proxy-reload', { method: 'POST' }).catch(() => undefined);
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
  const [tab, setTab] = useState<'endpoints' | 'testing'>('endpoints');

  return (
    <div>
      <PageHead
        title="Proxy"
        sub="Route AI traffic through a local HTTP proxy. Each endpoint binds to a port on the configured worker node."
      />

      <div style={{ borderBottom: '1px solid var(--border-subtle)', marginBottom: 0 }}>
        <Tabs
          active={tab}
          onChange={(t) => setTab(t as 'endpoints' | 'testing')}
          tabs={[
            { id: 'endpoints', label: 'Endpoints' },
            { id: 'testing',   label: 'Testing'   },
          ]}
        />
      </div>

      {tab === 'testing' && (
        <Section style={{ paddingTop: 20 }}>
          <ProxyTestingPane allEps={activeEndpoints} />
        </Section>
      )}

      {tab === 'endpoints' && (
      <>
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
      </>
      )}
    </div>
  );
}
