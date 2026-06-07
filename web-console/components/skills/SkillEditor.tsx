'use client';

/**
 * Dedicated SKILL.md editor (Registry → Skills). Edits a single skill's
 * frontmatter form + markdown body. The design's right-hand panels (version
 * history, attached agents, progressive disclosure) are intentionally omitted.
 *
 * Design-only fields (tags/preload/versions/attachments) live in the skill's
 * `frontmatter` JSONB; "Publish version" bumps `frontmatter.versions` so the
 * registry's "Total versions" widget reflects published iterations.
 */

import { createElement, useState, type ReactNode, type CSSProperties } from 'react';
import { Btn, Tag, Toggle, Tabs, Field, Input, TextArea, Notif, type TagColor } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { updateResource, ApiError } from '@/lib/api/resources';
import type { Skill, SkillFrontmatter } from '@/lib/types';

const statusColor: Record<string, TagColor> = { published: 'green', draft: 'blue', deprecated: 'warm' };

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function SkillEditor({ skill, onBack, onSaved }: { skill: Skill; onBack: () => void; onSaved: () => void }) {
  const fm0 = (skill.frontmatter ?? {}) as SkillFrontmatter;
  const [tab, setTab] = useState('edit');
  const [name, setName] = useState(skill.name);
  const [description, setDescription] = useState(skill.description ?? '');
  const [tags, setTags] = useState((fm0.tags ?? []).join(', '));
  const [preload, setPreload] = useState(!!fm0.preload);
  const [body, setBody] = useState(skill.body ?? '');
  const [status, setStatus] = useState(skill.status);
  const [version, setVersion] = useState(skill.version);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function buildFrontmatter(extraVersions = 0): SkillFrontmatter {
    return {
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      preload,
      versions: (fm0.versions ?? 1) + extraVersions,
      attachments: fm0.attachments ?? 0,
    };
  }

  async function save(publish: boolean) {
    setBusy(true);
    setErr(null);
    setOk(null);
    const nextStatus = publish ? 'published' : status;
    try {
      const updated = await updateResource<Skill>('skills', skill.id, {
        name,
        slug: slugify(name),
        description: description || null,
        body,
        status: nextStatus,
        frontmatter: buildFrontmatter(publish ? 1 : 0),
      });
      setStatus(updated.status);
      setVersion(updated.version);
      // Reflect the bumped version count locally so a subsequent save is correct.
      fm0.versions = (updated.frontmatter as SkillFrontmatter | null)?.versions ?? buildFrontmatter(publish ? 1 : 0).versions;
      setOk(publish ? 'Published.' : 'Saved.');
      onSaved();
    } catch (e) {
      setErr((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '16px 32px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <Btn kind="ghost" size="sm" icon="chevronLeft" title="Back to registry" onClick={onBack} />
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: 'var(--brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          <Icon name="idea" size={18} />
        </span>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="mono" style={{ fontSize: 16, fontWeight: 600 }}>{name || 'untitled'}</span>
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-helper)' }}>v{version}</span>
            <Tag color={statusColor[status] ?? 'gray'} sm>{status}</Tag>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>SKILL.md</div>
        </div>
        <Btn kind="secondary" size="sm" icon="save" onClick={() => save(false)} disabled={busy}>Save</Btn>
        <Btn kind="primary" size="sm" iconRight="checkmark" onClick={() => save(true)} disabled={busy}>Publish version</Btn>
      </div>

      <div className="section">
        {err && <div style={{ marginBottom: 12 }}><Notif kind="error" title="Could not save" onClose={() => setErr(null)}>{err}</Notif></div>}
        {ok && <div style={{ marginBottom: 12 }}><Notif kind="success" title={ok} onClose={() => setOk(null)} /></div>}

        <div style={{ marginBottom: 16 }}>
          <Tabs contained active={tab} onChange={setTab} tabs={[{ id: 'edit', label: 'SKILL.md' }, { id: 'preview', label: 'Preview' }]} />
        </div>

        {tab === 'edit' ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <div className="tile" style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Frontmatter</div>
              <Field label="name">
                <Input value={name} onChange={setName} mono placeholder="incident-responder" />
              </Field>
              <Field label="description" help={`${description.length}/200 — shown to the agent upfront (progressive disclosure)`}>
                <TextArea value={description} onChange={(v) => setDescription(v.slice(0, 200))} rows={3} placeholder="One or two sentences describing when to use this skill." />
              </Field>
              <Field label="tags" help="Comma-separated">
                <Input value={tags} onChange={setTags} placeholder="ops, triage" />
              </Field>
              <div className="field" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label className="field-label" style={{ marginBottom: 2 }}>Preload</label>
                  <span className="field-help">Inject the full body upfront instead of on selection</span>
                </div>
                <Toggle on={preload} onChange={setPreload} />
              </div>
            </div>

            <div className="tile" style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Body</div>
                <div style={{ fontSize: 12, color: 'var(--text-helper)' }}>{body.length} chars · markdown</div>
              </div>
              <TextArea value={body} onChange={setBody} mono rows={16} placeholder={'# skill-name\n\nDescribe the capability…'} />
            </div>
          </div>
        ) : (
          <div className="tile" style={{ padding: 24 }}>
            {body.trim() ? <Markdown source={body} /> : <span style={{ color: 'var(--text-helper)' }}>Nothing to preview yet.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------- Minimal dependency-free Markdown renderer (Preview tab) -------- */

/** Inline formatting: code spans, bold, italic, and links. */
function renderInline(text: string, base: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${base}-${i++}`;
    if (t.startsWith('`')) out.push(<code key={k} className="mono" style={{ background: 'var(--layer-02)', padding: '1px 5px', borderRadius: 3, fontSize: 12 }}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith('*')) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else if (t.startsWith('_')) out.push(<em key={k}>{t.slice(1, -1)}</em>);
    else {
      const lm = /\[([^\]]+)\]\(([^)]+)\)/.exec(t)!;
      out.push(<a key={k} href={lm[2]} target="_blank" rel="noreferrer" style={{ color: 'var(--link-primary, var(--brand))' }}>{lm[1]}</a>);
    }
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Block-level renderer: headings, fenced code, frontmatter, lists, quotes, rules, paragraphs. */
function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  const hStyle = (lvl: number): CSSProperties => ({
    fontSize: [22, 18, 16, 14, 13, 12][lvl - 1],
    fontWeight: 600,
    margin: blocks.length ? '18px 0 8px' : '0 0 8px',
    lineHeight: 1.3,
  });

  const codeBlock = (content: string, label?: string, key?: string) => (
    <pre key={key} style={{ background: 'var(--layer-02)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: 12, overflow: 'auto', margin: '12px 0' }}>
      {label && <div style={{ fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-helper)', marginBottom: 6 }}>{label}</div>}
      <code className="mono" style={{ fontSize: 12, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{content}</code>
    </pre>
  );

  // Leading YAML frontmatter (--- … ---).
  if (lines[0]?.trim() === '---') {
    let j = 1;
    while (j < lines.length && lines[j]!.trim() !== '---') j++;
    if (j < lines.length) {
      blocks.push(codeBlock(lines.slice(1, j).join('\n'), 'frontmatter', 'fm'));
      i = j + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === '') { i++; continue; }

    // Fenced code block.
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const buf: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.trim() !== '```') buf.push(lines[i++]!);
      i++;
      blocks.push(codeBlock(buf.join('\n'), lang || undefined, `code-${i}`));
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${i}`} style={{ border: 'none', borderTop: '1px solid var(--border-subtle)', margin: '18px 0' }} />);
      i++;
      continue;
    }

    // Heading.
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      const lvl = h[1]!.length;
      blocks.push(createElement(`h${lvl}`, { key: `h-${i}`, style: hStyle(lvl) }, renderInline(h[2]!, `h-${i}`)));
      i++;
      continue;
    }

    // Table (GFM): header row + `|---|---|` separator + body rows.
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(lines[i + 1]!) && lines[i + 1]!.includes('-')) {
      const parseRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const header = parseRow(line);
      i += 2;
      const rowsT: string[][] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== '') rowsT.push(parseRow(lines[i++]!));
      const cell: CSSProperties = { border: '1px solid var(--border-subtle)', padding: '6px 10px', textAlign: 'left', verticalAlign: 'top' };
      blocks.push(
        <div key={`tbl-${i}`} style={{ overflowX: 'auto', margin: '12px 0' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
            <thead>
              <tr>{header.map((h, n) => <th key={n} style={{ ...cell, fontWeight: 600, background: 'var(--layer-02)' }}>{renderInline(h, `th-${i}-${n}`)}</th>)}</tr>
            </thead>
            <tbody>
              {rowsT.map((r, ri) => <tr key={ri}>{header.map((_, ci) => <td key={ci} style={cell}>{renderInline(r[ci] ?? '', `td-${i}-${ri}-${ci}`)}</td>)}</tr>)}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    // Blockquote.
    if (trimmed.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) buf.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      blocks.push(
        <blockquote key={`q-${i}`} style={{ borderLeft: '3px solid var(--border-strong, var(--border-subtle))', margin: '12px 0', padding: '2px 0 2px 12px', color: 'var(--text-secondary)' }}>
          {renderInline(buf.join(' '), `q-${i}`)}
        </blockquote>,
      );
      continue;
    }

    // Ordered list.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={`ol-${i}`} style={{ margin: '8px 0', paddingLeft: 22, lineHeight: 1.6 }}>{items.map((it, n) => <li key={n}>{renderInline(it, `ol-${i}-${n}`)}</li>)}</ol>);
      continue;
    }

    // Unordered list.
    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i]!)) items.push(lines[i++]!.replace(/^\s*[-*]\s+/, ''));
      blocks.push(<ul key={`ul-${i}`} style={{ margin: '8px 0', paddingLeft: 22, lineHeight: 1.6 }}>{items.map((it, n) => <li key={n}>{renderInline(it, `ul-${i}-${n}`)}</li>)}</ul>);
      continue;
    }

    // Paragraph (consecutive non-blank, non-special lines).
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== '' &&
      !/^(#{1,6}\s|>|```|\d+\.\s|[-*]\s)/.test(lines[i]!.trim()) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i]!.trim())
    ) {
      para.push(lines[i++]!);
    }
    blocks.push(<p key={`p-${i}`} style={{ margin: '8px 0', lineHeight: 1.7, color: 'var(--text-primary)' }}>{renderInline(para.join(' '), `p-${i}`)}</p>);
  }

  return <div style={{ fontSize: 14, color: 'var(--text-primary)' }}>{blocks}</div>;
}
