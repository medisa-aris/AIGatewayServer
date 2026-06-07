'use client';

/**
 * Registry → Skills. Skills Registry: a card-grid landing with live stat widgets
 * and a "New skill" flow that opens a dedicated SKILL.md editor.
 *
 * The `skills` table has no version-history or agents table, so the
 * "Total versions" / "Agent attachments" widgets are derived from per-skill
 * counts kept in the `frontmatter` JSONB (see SkillFrontmatter). tags + preload
 * also live in frontmatter since the table has no columns for them.
 */

import { useMemo, useRef, useState } from 'react';
import { PageHead, Btn, Tag, Toggle, Field, Input, TextArea, Modal, Notif, SearchBox, type TagColor } from '@/components/ui';
import { StatStrip, Section } from '@/components/ui/screen';
import { Icon } from '@/components/Icon';
import { SkillEditor } from '@/components/skills/SkillEditor';
import { useResourceList, useDefaultOrgId } from '@/lib/hooks';
import { createResource, ApiError } from '@/lib/api/resources';
import type { Skill, SkillFrontmatter } from '@/lib/types';

const statusColor: Record<string, TagColor> = { published: 'green', draft: 'blue', deprecated: 'warm' };

const fm = (s: Skill): SkillFrontmatter => (s.frontmatter ?? {}) as SkillFrontmatter;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

type ParsedSkillMd = { name: string; description: string; tags: string[]; preload: boolean; body: string };

/**
 * Parse an uploaded SKILL.md: a leading YAML `--- … ---` frontmatter block
 * (name/description/tags/preload) followed by the markdown body. Frontmatter is
 * optional — name falls back to the first `# heading`, then the filename.
 */
function parseSkillMd(text: string, fileName: string): ParsedSkillMd {
  const norm = text.replace(/\r\n/g, '\n');
  const meta: Record<string, string> = {};
  let tags: string[] = [];
  let preload = false;
  let body = norm;

  const fmMatch = /^---\n([\s\S]*?)\n---\n?/.exec(norm);
  if (fmMatch) {
    body = norm.slice(fmMatch[0].length);
    for (const line of fmMatch[1]!.split('\n')) {
      const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1]!.toLowerCase();
      const val = m[2]!.trim().replace(/^["']|["']$/g, '');
      if (key === 'tags') {
        tags = val.replace(/^\[|\]$/g, '').split(',').map((t) => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
      } else if (key === 'preload') {
        preload = /^(true|yes|1)$/i.test(val);
      } else {
        meta[key] = val;
      }
    }
  }

  let name = meta.name ?? '';
  if (!name) name = (/^#\s+(.+)$/m.exec(body)?.[1] ?? '').trim();
  if (!name) name = fileName.replace(/\.(md|markdown)$/i, '');

  return { name, description: meta.description ?? '', tags, preload, body: body.replace(/^\n+/, '') };
}

const TEMPLATES: { id: string; title: string; icon: string; sub: string; body: (name: string) => string }[] = [
  { id: 'blank', title: 'Blank skill', icon: 'document', sub: 'Start from an empty SKILL.md', body: (n) => `# ${n || 'skill'}\n\nDescribe the capability…\n` },
  {
    id: 'data',
    title: 'Data analyst',
    icon: 'database',
    sub: 'Schema-aware SQL generation',
    body: (n) => `# ${n || 'data-analyst'}\n\nTranslate natural-language questions into validated SQL.\n\n## Inputs\n- The user's question\n- The available table schema\n\n## Steps\n1. Identify the relevant tables and columns.\n2. Draft a single SQL statement.\n3. Validate it against the schema before returning.\n`,
  },
  {
    id: 'tool',
    title: 'Tool wrapper',
    icon: 'plug',
    sub: 'Wrap MCP tools with guardrails',
    body: (n) => `# ${n || 'tool-wrapper'}\n\nWrap an MCP tool with input validation and guardrails.\n\n## Guardrails\n- Validate arguments before invoking.\n- Redact secrets from the output.\n\n## Usage\nDescribe when the agent should reach for this tool.\n`,
  },
];

export default function SkillsPage() {
  const orgId = useDefaultOrgId();
  const { data: rows, mutate } = useResourceList<Skill>('skills');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [q, setQ] = useState('');

  // Create modal state.
  const [modal, setModal] = useState(false);
  const [cName, setCName] = useState('');
  const [cDesc, setCDesc] = useState('');
  const [cTags, setCTags] = useState('');
  const [cPreload, setCPreload] = useState(false);
  const [cTpl, setCTpl] = useState('blank');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Upload modal state.
  const [upModal, setUpModal] = useState(false);
  const [upParsed, setUpParsed] = useState<ParsedSkillMd | null>(null);
  const [upFile, setUpFile] = useState<string | null>(null);
  const [upDrag, setUpDrag] = useState(false);
  const [upBusy, setUpBusy] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stats = useMemo(() => {
    let preloaded = 0, versions = 0, attachments = 0;
    for (const s of rows) {
      const f = fm(s);
      if (f.preload) preloaded += 1;
      versions += f.versions ?? 1;
      attachments += f.attachments ?? 0;
    }
    return { skills: rows.length, preloaded, versions, attachments };
  }, [rows]);

  const filtered = useMemo(() => {
    if (!q.trim()) return rows;
    const needle = q.toLowerCase();
    return rows.filter((s) =>
      [s.name, s.slug, ...(fm(s).tags ?? [])].some((v) => String(v ?? '').toLowerCase().includes(needle)),
    );
  }, [rows, q]);

  const editing = editingId ? rows.find((s) => s.id === editingId) : undefined;

  function openCreate() {
    setCName('');
    setCDesc('');
    setCTags('');
    setCPreload(false);
    setCTpl('blank');
    setErr(null);
    setModal(true);
  }

  async function create() {
    setBusy(true);
    setErr(null);
    const tpl = TEMPLATES.find((t) => t.id === cTpl) ?? TEMPLATES[0]!;
    try {
      const created = await createResource<Skill>('skills', {
        ...(orgId ? { org_id: orgId } : {}),
        name: cName,
        slug: slugify(cName),
        description: cDesc || null,
        version: '1.0.0',
        status: 'draft',
        frontmatter: {
          tags: cTags.split(',').map((t) => t.trim()).filter(Boolean),
          preload: cPreload,
          versions: 1,
          attachments: 0,
        },
        body: tpl.body(cName),
      });
      setModal(false);
      await mutate();
      setEditingId(created.id);
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  function openUpload() {
    setUpParsed(null);
    setUpFile(null);
    setUpDrag(false);
    setUpErr(null);
    setUpModal(true);
  }

  async function ingestFile(file: File) {
    setUpErr(null);
    if (!/\.(md|markdown)$/i.test(file.name)) {
      setUpErr('Please choose a Markdown file (.md).');
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseSkillMd(text, file.name);
      if (!parsed.name.trim()) {
        setUpErr('Could not determine a skill name from the file. Add a `name:` frontmatter field or a `# heading`.');
        return;
      }
      setUpParsed(parsed);
      setUpFile(file.name);
    } catch {
      setUpErr('Could not read the file.');
    }
  }

  async function createFromUpload() {
    if (!upParsed) return;
    setUpBusy(true);
    setUpErr(null);
    try {
      const created = await createResource<Skill>('skills', {
        ...(orgId ? { org_id: orgId } : {}),
        name: upParsed.name,
        slug: slugify(upParsed.name),
        description: upParsed.description || null,
        version: '1.0.0',
        status: 'draft',
        frontmatter: { tags: upParsed.tags, preload: upParsed.preload, versions: 1, attachments: 0 },
        body: upParsed.body,
      });
      setUpModal(false);
      await mutate();
      setEditingId(created.id);
    } catch (e) {
      setUpErr((e as ApiError).message);
    } finally {
      setUpBusy(false);
    }
  }

  if (editing) {
    return <SkillEditor skill={editing} onBack={() => setEditingId(null)} onSaved={() => mutate()} />;
  }

  return (
    <div>
      <PageHead
        title="Skills Registry"
        sub="Centralised, versioned catalog of reusable agent capabilities. SKILL.md format with progressive disclosure."
        actions={
          <>
            <Btn kind="secondary" size="sm" icon="upload" onClick={openUpload}>Upload skill</Btn>
            <Btn kind="primary" size="sm" icon="add" onClick={openCreate}>New skill</Btn>
          </>
        }
      />

      <div className="section">
        <StatStrip
          stats={[
            { label: 'Skills', value: stats.skills, icon: 'idea' },
            { label: 'Preloaded', value: stats.preloaded, icon: 'zap' },
            { label: 'Agent attachments', value: stats.attachments, icon: 'plug' },
            { label: 'Total versions', value: stats.versions, icon: 'layers' },
          ]}
        />
      </div>

      <Section style={{ paddingTop: 4 }}>
        <div style={{ width: 360, marginBottom: 16 }}>
          <SearchBox value={q} onChange={setQ} placeholder="Search skills or tags" />
        </div>

        {filtered.length === 0 ? (
          <div className="empty" style={{ padding: 48 }}>No skills yet. Create one with “New skill”.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
            {filtered.map((s) => {
              const f = fm(s);
              return (
                <div
                  key={s.id}
                  className="tile"
                  onClick={() => setEditingId(s.id)}
                  style={{ padding: 16, display: 'flex', gap: 12, cursor: 'pointer' }}
                >
                  <span
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 6,
                      background: 'var(--brand)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="idea" size={20} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span className="mono cell-strong">{s.name}</span>
                      {f.preload && <Tag color="blue" sm>preload</Tag>}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>{s.description ?? '—'}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {(f.tags ?? []).map((t) => <Tag key={t} color="gray" sm>{t}</Tag>)}
                      </div>
                      <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)', whiteSpace: 'nowrap' }}>
                        v{f.versions ?? 1} · {f.attachments ?? 0} agents
                      </span>
                    </div>
                  </div>
                  <Btn kind="ghost" size="sm" icon="edit" title="Edit" onClick={(e) => { e.stopPropagation(); setEditingId(s.id); }} />
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {modal && (
        <Modal
          title="New skill"
          label="Skills Registry"
          onClose={() => setModal(false)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setModal(false)}>Cancel</Btn>
              <Btn kind="primary" iconRight="arrowRight" onClick={create} disabled={busy || !cName.trim()}>
                {busy ? 'Creating…' : 'Create & open editor'}
              </Btn>
            </>
          }
        >
          {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not create">{err}</Notif></div>}
          <Field label="Name" help="Lowercase, hyphenated identifier">
            <Input value={cName} onChange={setCName} mono placeholder="incident-responder" />
          </Field>
          <Field label="Description" help={`${cDesc.length}/200 · shown to the agent upfront (progressive disclosure)`}>
            <TextArea value={cDesc} onChange={(v) => setCDesc(v.slice(0, 200))} rows={3} placeholder="One or two sentences describing when to use this skill." />
          </Field>
          <Field label="Tags" help="Comma-separated">
            <Input value={cTags} onChange={setCTags} placeholder="ops, triage" />
          </Field>
          <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
            <div>
              <label className="field-label" style={{ marginBottom: 2 }}>Preload</label>
              <span className="field-help">Inject the full body upfront instead of on selection</span>
            </div>
            <Toggle on={cPreload} onChange={setCPreload} />
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>Starter template</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setCTpl(t.id)}
                  className="tile"
                  style={{
                    textAlign: 'left',
                    padding: 14,
                    cursor: 'pointer',
                    border: cTpl === t.id ? '1px solid var(--brand)' : '1px solid var(--border-subtle)',
                    background: cTpl === t.id ? 'var(--brand-subtle, var(--layer-02))' : 'var(--layer-01)',
                  }}
                >
                  <span style={{ color: 'var(--brand)', display: 'inline-flex', marginBottom: 8 }}><Icon name={t.icon} size={20} /></span>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>{t.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </Modal>
      )}

      {upModal && (
        <Modal
          title="Upload skill"
          label="Skills Registry"
          onClose={() => setUpModal(false)}
          footer={
            <>
              <Btn kind="secondary" onClick={() => setUpModal(false)}>Cancel</Btn>
              <Btn kind="primary" iconRight="arrowRight" onClick={createFromUpload} disabled={upBusy || !upParsed}>
                {upBusy ? 'Importing…' : 'Import & open editor'}
              </Btn>
            </>
          }
        >
          {upErr && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not upload" onClose={() => setUpErr(null)}>{upErr}</Notif></div>}

          <input
            ref={fileRef}
            type="file"
            accept=".md,.markdown,text/markdown"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) ingestFile(f); e.target.value = ''; }}
          />

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setUpDrag(true); }}
            onDragLeave={() => setUpDrag(false)}
            onDrop={(e) => { e.preventDefault(); setUpDrag(false); const f = e.dataTransfer.files?.[0]; if (f) ingestFile(f); }}
            style={{
              border: `1px dashed ${upDrag ? 'var(--brand)' : 'var(--border-strong, var(--border-subtle))'}`,
              borderRadius: 6,
              padding: 32,
              textAlign: 'center',
              cursor: 'pointer',
              background: upDrag ? 'var(--brand-subtle, var(--layer-02))' : 'var(--layer-01)',
            }}
          >
            <span style={{ color: 'var(--brand)', display: 'inline-flex', marginBottom: 8 }}><Icon name="upload" size={24} /></span>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
              {upFile ? upFile : 'Drop a SKILL.md file here, or click to browse'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>Markdown (.md) with optional YAML frontmatter</div>
          </div>

          {upParsed && (
            <div className="tile" style={{ padding: 16, marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Parsed from file</div>
              <Field label="Name">
                <Input value={upParsed.name} onChange={(v) => setUpParsed({ ...upParsed, name: v })} mono />
              </Field>
              <Field label="Description" help={`${upParsed.description.length}/200`}>
                <TextArea value={upParsed.description} onChange={(v) => setUpParsed({ ...upParsed, description: v.slice(0, 200) })} rows={2} />
              </Field>
              <Field label="Tags" help="Comma-separated">
                <Input value={upParsed.tags.join(', ')} onChange={(v) => setUpParsed({ ...upParsed, tags: v.split(',').map((t) => t.trim()).filter(Boolean) })} />
              </Field>
              <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label className="field-label" style={{ marginBottom: 2 }}>Preload</label>
                  <span className="field-help">Inject the full body upfront instead of on selection</span>
                </div>
                <Toggle on={upParsed.preload} onChange={(v) => setUpParsed({ ...upParsed, preload: v })} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>{upParsed.body.length} chars of markdown body</div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
