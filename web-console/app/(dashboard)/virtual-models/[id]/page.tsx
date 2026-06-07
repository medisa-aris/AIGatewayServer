'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  PageHead, Btn, Modal, Field, Input, TextArea, Select, Toggle, Notif,
} from '@/components/ui';
import { Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { getResource, createResource, updateResource, ApiError } from '@/lib/api/resources';
import type {
  VirtualModel, VirtualModelRule, VirtualModelRoutingConfig, Model,
} from '@/lib/types';

/* ─── helpers ────────────────────────────────────────────────────────────── */

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const DEFAULT_CONFIG: VirtualModelRoutingConfig = {
  auto_route:          false,
  decision_engine:     'classifier',
  fallback_enabled:    false,
  fallback_chain:      [],
  classifier_model_id: null,
};

type DecisionEngine = VirtualModelRoutingConfig['decision_engine'];

/* ─── Condition types ─────────────────────────────────────────────────────── */

interface Condition {
  field: string;
  op:    string;
  value: string;
}

interface RuleDraft {
  id?:               string;  // undefined = new (not yet persisted)
  name:              string;
  priority:          string;
  conditions:        Condition[];
  target_model_id:   string;
  _deleted?:         boolean;
}

const CONDITION_FIELDS = [
  { value: 'task_category', label: 'Task category' },
  { value: 'input_length',  label: 'Input length'  },
];

const TASK_CATEGORY_VALUES = [
  'Quick chat', 'General chat', 'Code', 'Analysis', 'Creative', 'Translation',
];

const LENGTH_OPS = [
  { value: '<',  label: '<'  },
  { value: '>',  label: '>'  },
  { value: '=',  label: '='  },
];

const EQUAL_OP = [{ value: '=', label: '=' }];

function emptyCondition(): Condition {
  return { field: 'task_category', op: '=', value: 'Quick chat' };
}

function emptyRule(priority: number): RuleDraft {
  return { name: '', priority: String(priority), conditions: [emptyCondition()], target_model_id: '' };
}

/* ─── ClassifierModal ────────────────────────────────────────────────────── */

function ClassifierModal({
  current, models, onSave, onClose,
}: {
  current:  string | null;
  models:   Model[];
  onSave:   (id: string | null) => void;
  onClose:  () => void;
}) {
  const [val, setVal] = useState(current ?? '');
  return (
    <Modal
      title="Configure classifier"
      label="Decision engine"
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn kind="secondary" onClick={onClose}>Cancel</Btn>
          <Btn kind="primary" onClick={() => { onSave(val || null); onClose(); }}>
            Save
          </Btn>
        </div>
      }
    >
      <Field label="Classifier model" help="This model reads each prompt and predicts the best target.">
        <Select
          value={val}
          onChange={setVal}
          options={[
            { value: '', label: 'None selected' },
            ...models.map(m => ({ value: m.id, label: m.name || m.model_id })),
          ]}
        />
      </Field>
    </Modal>
  );
}

/* ─── RoutingRulesModal ──────────────────────────────────────────────────── */

function RoutingRulesModal({
  initialRules, models, vmId, orgId, onClose, onSaved,
}: {
  initialRules: VirtualModelRule[];
  models:       Model[];
  vmId:         string;
  orgId:        string;
  onClose:      () => void;
  onSaved:      () => void;
}) {
  const [drafts, setDrafts] = useState<RuleDraft[]>(() =>
    initialRules.map(r => ({
      id:              r.id,
      name:            (r.parameters as { name?: string } | null)?.name ?? '',
      priority:        String(r.priority),
      conditions:      (r.condition as Condition[] | null) ?? [emptyCondition()],
      target_model_id: r.target_model_id,
    }))
  );
  const [busy,  setBusy]  = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCount = drafts.filter(d => !d._deleted).length;

  function addRule() {
    setDrafts(prev => [...prev, emptyRule(prev.filter(d => !d._deleted).length)]);
  }

  function removeRule(i: number) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, _deleted: true } : d));
  }

  function updateRule(i: number, patch: Partial<RuleDraft>) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, ...patch } : d));
  }

  function addCondition(ruleIdx: number) {
    setDrafts(prev => prev.map((d, idx) =>
      idx === ruleIdx ? { ...d, conditions: [...d.conditions, emptyCondition()] } : d
    ));
  }

  function removeCondition(ruleIdx: number, condIdx: number) {
    setDrafts(prev => prev.map((d, idx) =>
      idx === ruleIdx
        ? { ...d, conditions: d.conditions.filter((_, ci) => ci !== condIdx) }
        : d
    ));
  }

  function updateCondition(ruleIdx: number, condIdx: number, patch: Partial<Condition>) {
    setDrafts(prev => prev.map((d, idx) => {
      if (idx !== ruleIdx) return d;
      return {
        ...d,
        conditions: d.conditions.map((c, ci) =>
          ci === condIdx ? { ...c, ...patch } : c
        ),
      };
    }));
  }

  async function handleSave() {
    // Validate priority uniqueness
    const activePriorities = drafts
      .filter(d => !d._deleted)
      .map(d => Number(d.priority));
    if (activePriorities.length !== new Set(activePriorities).size) {
      setError('Rule priorities must be unique. Each rule needs a different priority number.');
      return;
    }

    // Validate all active rules have a target model
    const missingTarget = drafts.find(d => !d._deleted && !d.target_model_id);
    if (missingTarget) {
      setError('All rules must have a target model selected under "ROUTE TO".');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      for (const draft of drafts) {
        const payload = {
          virtual_model_id: vmId,
          target_model_id:  draft.target_model_id,
          priority:         Number(draft.priority) || 0,
          rule_type:        'request_type',
          condition:        draft.conditions,
          parameters:       { name: draft.name },
          is_active:        !draft._deleted,
        };
        if (draft.id) {
          await updateResource('virtual-model-rules', draft.id, payload);
        } else if (!draft._deleted) {
          await createResource('virtual-model-rules', payload);
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title="Routing rules"
      label={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '2px 8px',
            border: '1px solid var(--border-strong)', borderRadius: 12,
            color: 'var(--text-secondary)',
          }}>
            ✦ Generate with AI
          </span>
        </span>
      }
      onClose={onClose}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: 'var(--text-helper)', flex: 1 }}>
            {activeCount} active rule{activeCount !== 1 ? 's' : ''}
          </span>
          <Btn kind="secondary" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind="primary" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save rules'}
          </Btn>
        </div>
      }
    >
      {error && <Notif kind="error" onClose={() => setError(null)}>{error}</Notif>}

      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        Rules are evaluated in priority order (lowest number first). The first matching rule wins.
        Each rule&apos;s conditions are AND-ed together.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {drafts.map((draft, ruleIdx) => {
          if (draft._deleted) return null;
          return (
            <div key={ruleIdx} style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 4, padding: '14px 16px',
            }}>
              {/* Rule header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--support-success)',
                }} />
                <input
                  value={draft.name}
                  onChange={(e) => updateRule(ruleIdx, { name: e.target.value })}
                  placeholder={`Rule ${ruleIdx + 1}`}
                  style={{
                    flex: 1, border: '1px solid var(--border-strong)', borderRadius: 2,
                    padding: '4px 8px', fontSize: 13, background: 'var(--field-bg)',
                    color: 'var(--text-primary)',
                  }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-helper)', whiteSpace: 'nowrap' }}>
                  Priority
                </span>
                <input
                  type="number"
                  value={draft.priority}
                  onChange={(e) => updateRule(ruleIdx, { priority: e.target.value })}
                  style={{
                    width: 56, border: '1px solid var(--border-strong)', borderRadius: 2,
                    padding: '4px 6px', fontSize: 13, textAlign: 'center',
                    background: 'var(--field-bg)', color: 'var(--text-primary)',
                  }}
                />
                <button
                  onClick={() => removeRule(ruleIdx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-helper)', padding: 2 }}
                  title="Remove rule"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>

              {/* Conditions */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-helper)', marginBottom: 8 }}>
                IF ALL CONDITIONS MATCH
              </div>
              {draft.conditions.map((cond, condIdx) => (
                <div key={condIdx} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <div style={{ flex: '0 0 160px' }}>
                    <Select
                      value={cond.field}
                      onChange={(v) => updateCondition(ruleIdx, condIdx, { field: v, value: v === 'task_category' ? 'Quick chat' : '' })}
                      options={CONDITION_FIELDS}
                    />
                  </div>
                  <div style={{ flex: '0 0 60px' }}>
                    <Select
                      value={cond.op}
                      onChange={(v) => updateCondition(ruleIdx, condIdx, { op: v })}
                      options={cond.field === 'input_length' ? LENGTH_OPS : EQUAL_OP}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    {cond.field === 'task_category' ? (
                      <Select
                        value={cond.value}
                        onChange={(v) => updateCondition(ruleIdx, condIdx, { value: v })}
                        options={TASK_CATEGORY_VALUES.map(v => ({ value: v, label: v }))}
                      />
                    ) : (
                      <Input
                        type="number"
                        value={cond.value}
                        onChange={(v) => updateCondition(ruleIdx, condIdx, { value: v })}
                        placeholder="tokens"
                        mono
                      />
                    )}
                  </div>
                  {draft.conditions.length > 1 && (
                    <button
                      onClick={() => removeCondition(ruleIdx, condIdx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-helper)', padding: 2 }}
                    >
                      <Icon name="close" size={13} />
                    </button>
                  )}
                </div>
              ))}
              <button
                onClick={() => addCondition(ruleIdx)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 13, color: 'var(--link)', padding: 0, marginBottom: 12,
                }}
              >
                + Add condition
              </button>

              {/* Route to */}
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', color: 'var(--text-helper)', marginBottom: 8 }}>
                ROUTE TO
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--support-success)',
                }} />
                <Select
                  value={draft.target_model_id}
                  onChange={(v) => updateRule(ruleIdx, { target_model_id: v })}
                  options={[
                    { value: '', label: 'Select model…' },
                    ...models.map(m => ({ value: m.id, label: `${m.name || m.model_id}` })),
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={addRule}
        style={{
          marginTop: 12, background: 'none', border: '1px dashed var(--border-strong)',
          borderRadius: 4, width: '100%', padding: '10px 0', cursor: 'pointer',
          fontSize: 13, color: 'var(--text-secondary)',
        }}
      >
        + Add rule
      </button>
    </Modal>
  );
}

/* ─── Main detail page ───────────────────────────────────────────────────── */

export default function VirtualModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id     = params.id;
  const isNew  = id === 'new';
  const router = useRouter();
  const orgId  = useDefaultOrgId();

  const { data: allModels } = useResourceList<Model>('models', { limit: 500 });
  const models = allModels.filter(m => m.is_active);
  const { data: allRules, mutate: reloadRules } = useResourceList<VirtualModelRule>(
    'virtual-model-rules', { limit: 500 }
  );

  // Settings state
  const [name,        setName]        = useState('');
  const [slug,        setSlug]        = useState('');
  const [description, setDescription] = useState('');
  const [isActive,    setIsActive]    = useState(true);
  const [slugTouched, setSlugTouched] = useState(false);

  // Routing config state
  const [cfg, setCfg] = useState<VirtualModelRoutingConfig>({ ...DEFAULT_CONFIG });

  // UI state
  const [busy,             setBusy]             = useState(false);
  const [saveError,        setSaveError]        = useState<string | null>(null);
  const [loading,          setLoading]          = useState(!isNew);
  const [showClassifier,   setShowClassifier]   = useState(false);
  const [showRules,        setShowRules]        = useState(false);
  const [addFallback,      setAddFallback]      = useState(false);
  const [fallbackPick,     setFallbackPick]     = useState('');

  // Load existing VM on edit
  useEffect(() => {
    if (isNew) return;
    getResource<VirtualModel>('virtual-models', id)
      .then(vm => {
        setName(vm.name ?? '');
        setSlug(vm.slug ?? '');
        setDescription(vm.description ?? '');
        setIsActive(vm.is_active ?? true);
        setSlugTouched(true);
        if (vm.routing_config) {
          setCfg({ ...DEFAULT_CONFIG, ...(vm.routing_config as VirtualModelRoutingConfig) });
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, isNew]);

  // Auto-derive slug from name when not manually edited
  useEffect(() => {
    if (!slugTouched && name) setSlug(slugify(name));
  }, [name, slugTouched]);

  const updateCfg = useCallback((patch: Partial<VirtualModelRoutingConfig>) => {
    setCfg(prev => ({ ...prev, ...patch }));
  }, []);

  // Rules scoped to this VM
  const vmRules = allRules.filter(r => r.virtual_model_id === id && r.is_active);

  // Model lookup map
  const modelById = Object.fromEntries(models.map(m => [m.id, m]));

  async function handleSave() {
    if (!orgId && isNew) { setSaveError('Organisation not loaded yet.'); return; }
    setBusy(true);
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        name,
        slug,
        description: description.trim() || null,
        is_active:   isActive,
        routing_config: cfg,
      };
      if (isNew) {
        payload.org_id = orgId;
        await createResource<VirtualModel>('virtual-models', payload);
      } else {
        await updateResource('virtual-models', id, payload);
      }
      router.push('/virtual-models');
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  }

  function removeFallback(modelId: string) {
    updateCfg({ fallback_chain: cfg.fallback_chain.filter(m => m !== modelId) });
  }

  function appendFallback(modelId: string) {
    if (!modelId || cfg.fallback_chain.includes(modelId)) return;
    updateCfg({ fallback_chain: [...cfg.fallback_chain, modelId] });
    setFallbackPick('');
    setAddFallback(false);
  }

  const classifierModel = cfg.classifier_model_id ? modelById[cfg.classifier_model_id] : null;
  const showEngine = cfg.auto_route;
  const showRulesBtn = cfg.decision_engine === 'rule-based' || cfg.decision_engine === 'rules-classifier';
  const showClassifierBtn = cfg.decision_engine === 'classifier' || cfg.decision_engine === 'rules-classifier';

  if (loading) {
    return <div style={{ padding: 40, color: 'var(--text-helper)', fontSize: 14 }}>Loading…</div>;
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <PageHead
        crumbs={[{ label: 'Virtual Models', href: true, onClick: () => router.push('/virtual-models') }]}
        title={isNew ? 'New virtual model' : (name || 'Edit virtual model')}
        sub={isNew ? 'Configure a routing alias for one or more provider models.' : undefined}
      />

      {/* ── Section A: Settings ── */}
      <Section style={{ paddingTop: 20 }}>
        <div className="tile" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Name">
              <Input
                value={name}
                onChange={(v) => setName(v)}
                placeholder="general-chat"
              />
            </Field>
            <Field label="Slug" help="URL-safe identifier">
              <Input
                value={slug}
                onChange={(v) => { setSlug(v); setSlugTouched(true); }}
                placeholder="general-chat"
                mono
              />
            </Field>
          </div>
          <Field label="Description" help="Optional">
            <TextArea
              value={description}
              onChange={(v) => setDescription(v)}
              placeholder="Describe what this virtual model does…"
            />
          </Field>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Active</span>
            <Toggle on={isActive} onChange={setIsActive} label="" />
          </div>
        </div>
      </Section>

      {/* ── Section B: Routing Strategy ── */}
      <Section title="Routing strategy" style={{ paddingTop: 24 }}>
        <div className="tile" style={{ padding: 0, overflow: 'hidden' }}>

          {/* Auto-route toggle row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '16px 20px',
            borderBottom: showEngine ? '1px solid var(--border-subtle)' : 'none',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-hover)',
            }}>
              <Icon name="zap" size={16} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Auto-route every message</div>
              <div style={{ fontSize: 12, color: 'var(--text-helper)', marginTop: 2 }}>
                {cfg.auto_route
                  ? 'The decision engine selects the best model for each request.'
                  : 'When off, you pick the model manually for each conversation.'}
              </div>
            </div>
            <Toggle on={cfg.auto_route} onChange={(v) => updateCfg({ auto_route: v })} label="" />
          </div>

          {/* Decision engine */}
          {showEngine && (
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-helper)', letterSpacing: '0.06em', marginBottom: 12 }}>
                DECISION ENGINE
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 14 }}>
                How the gateway chooses which model serves a request.
              </div>

              {(
                [
                  { value: 'classifier' as DecisionEngine, title: 'Classifier model', desc: 'A small model reads each prompt and predicts the best target.' },
                  { value: 'rule-based' as DecisionEngine, title: 'Rule-based', desc: 'Match keywords & length thresholds to a fixed routing table.' },
                  { value: 'rules-classifier' as DecisionEngine, title: 'Rules + classifier fallback', desc: 'Your rules fire first; the classifier decides anything left over.' },
                ] as { value: DecisionEngine; title: string; desc: string }[]
              ).map(opt => {
                const selected = cfg.decision_engine === opt.value;
                return (
                  <div
                    key={opt.value}
                    onClick={() => updateCfg({ decision_engine: opt.value })}
                    style={{
                      display: 'flex', alignItems: 'flex-start', gap: 12,
                      padding: '12px 14px', marginBottom: 8,
                      border: `1px solid ${selected ? 'var(--focus)' : 'var(--border-subtle)'}`,
                      borderRadius: 4, cursor: 'pointer',
                      background: selected ? 'var(--layer-hover, rgba(0,99,255,0.04))' : 'transparent',
                    }}
                  >
                    {/* Radio circle */}
                    <div style={{
                      width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                      border: `2px solid ${selected ? 'var(--focus)' : 'var(--border-strong)'}`,
                      background: selected ? 'var(--focus)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{opt.title}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{opt.desc}</div>
                      {selected && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                          {showClassifierBtn && (
                            <>
                              <Btn kind="primary" size="sm" onClick={(e) => { e.stopPropagation(); setShowClassifier(true); }}>
                                Configure classifier →
                              </Btn>
                              {classifierModel && (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 5,
                                  padding: '2px 10px', borderRadius: 12, fontSize: 12,
                                  border: '1px solid var(--border-strong)',
                                  color: 'var(--text-primary)',
                                }}>
                                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--support-success)', flexShrink: 0 }} />
                                  {classifierModel.name || classifierModel.model_id}
                                </span>
                              )}
                            </>
                          )}
                          {showRulesBtn && (
                            <>
                              <Btn kind="secondary" size="sm" onClick={(e) => { e.stopPropagation(); if (!isNew) setShowRules(true); }}>
                                Configure rules →
                              </Btn>
                              {vmRules.length > 0 && (
                                <span style={{
                                  padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                                  background: 'var(--tag-blue-bg)', color: 'var(--tag-blue-text)',
                                }}>
                                  {vmRules.length} rule{vmRules.length !== 1 ? 's' : ''}
                                </span>
                              )}
                              {isNew && (
                                <span style={{ fontSize: 12, color: 'var(--text-helper)' }}>
                                  (save first to configure rules)
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Fallback chain */}
          {showEngine && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'var(--bg-hover)',
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>F</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>Fallback chain</div>
                  <div style={{ fontSize: 12, color: 'var(--text-helper)', marginTop: 2 }}>
                    If the chosen model errors or hits a rate limit, retry down this order.
                  </div>
                </div>
                <Toggle
                  on={cfg.fallback_enabled}
                  onChange={(v) => updateCfg({ fallback_enabled: v })}
                  label=""
                />
              </div>

              {cfg.fallback_enabled && (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                  {cfg.fallback_chain.map((mid, i) => {
                    const m = modelById[mid];
                    return (
                      <span key={mid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {i > 0 && <span style={{ color: 'var(--text-helper)', fontSize: 13, userSelect: 'none' }}>›</span>}
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                          padding: '3px 10px', borderRadius: 12, fontSize: 12,
                          border: '1px solid var(--border-strong)', background: 'var(--layer)',
                        }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--support-success)' }} />
                          {m?.name || m?.model_id || mid}
                          <button
                            onClick={() => removeFallback(mid)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--text-helper)', marginLeft: 2 }}
                          >
                            ×
                          </button>
                        </span>
                      </span>
                    );
                  })}

                  {addFallback ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {cfg.fallback_chain.length > 0 && <span style={{ color: 'var(--text-helper)', fontSize: 13 }}>›</span>}
                      <div style={{ minWidth: 180 }}>
                        <Select
                          value={fallbackPick}
                          onChange={(v) => appendFallback(v)}
                          options={[
                            { value: '', label: 'Pick model…' },
                            ...models
                              .filter(m => !cfg.fallback_chain.includes(m.id))
                              .map(m => ({ value: m.id, label: m.name || m.model_id })),
                          ]}
                        />
                      </div>
                      <Btn kind="ghost" size="sm" onClick={() => setAddFallback(false)}>✕</Btn>
                    </span>
                  ) : (
                    <button
                      onClick={() => setAddFallback(true)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 26, height: 26, borderRadius: '50%', fontSize: 16, lineHeight: 1,
                        border: '1px dashed var(--border-strong)', background: 'none',
                        cursor: 'pointer', color: 'var(--text-secondary)',
                      }}
                    >
                      +
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Section>

      {/* ── Save bar ── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--shell-bg, #161616)',
        borderTop: '1px solid var(--border-subtle)',
        padding: '12px 24px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
        zIndex: 100,
      }}>
        {saveError && (
          <span style={{ fontSize: 13, color: 'var(--support-error)', marginRight: 8 }}>
            {saveError}
          </span>
        )}
        <Btn kind="secondary" onClick={() => router.push('/virtual-models')} disabled={busy}>
          Cancel
        </Btn>
        <Btn kind="primary" onClick={handleSave} disabled={busy || !name.trim() || !slug.trim()}>
          {busy ? 'Saving…' : isNew ? 'Create virtual model' : 'Save changes'}
        </Btn>
      </div>

      {/* ── Modals ── */}
      {showClassifier && (
        <ClassifierModal
          current={cfg.classifier_model_id}
          models={models}
          onSave={(mid) => updateCfg({ classifier_model_id: mid })}
          onClose={() => setShowClassifier(false)}
        />
      )}

      {showRules && !isNew && (
        <RoutingRulesModal
          initialRules={vmRules}
          models={models}
          vmId={id}
          orgId={orgId ?? ''}
          onClose={() => setShowRules(false)}
          onSaved={reloadRules}
        />
      )}
    </div>
  );
}
