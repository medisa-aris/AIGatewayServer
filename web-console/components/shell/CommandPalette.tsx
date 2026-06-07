'use client';

/** ⌘K command palette — searches pages plus a few seed catalogs. */

import { useEffect, useMemo, useRef, useState, Fragment, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import { NAV } from './nav';
import { SEED } from '@/lib/seed';

const I = (n: string, p: { size?: number; className?: string } = {}) => <Icon name={n} {...p} />;

interface IndexEntry {
  label: string;
  sub: string;
  icon: string;
  group: string;
  to: string;
}

function buildIndex(): IndexEntry[] {
  const idx: IndexEntry[] = [];
  NAV.forEach((g) => g.items.forEach((it) => idx.push({ label: it.label, sub: g.group, icon: it.icon, group: 'Pages', to: it.id })));
  SEED.providers.forEach((p) => idx.push({ label: p.name, sub: `${p.provider} · ${p.region}`, icon: 'plug', group: 'Provider accounts', to: 'providers' }));
  SEED.prompts.forEach((p) => idx.push({ label: `${p.repo}/${p.name}`, sub: `${p.model} · ${p.tag}`, icon: 'document', group: 'Prompts', to: 'prompts' }));
  SEED.mcpServers.forEach((s) => idx.push({ label: s.name, sub: `${s.cat} · ${s.tools} tools`, icon: 'server', group: 'MCP servers', to: 'mcp' }));
  SEED.skills.forEach((s) => idx.push({ label: s.name, sub: `skill · v${s.versions}`, icon: 'idea', group: 'Skills', to: 'skills' }));
  SEED.guardrails.forEach((g) => idx.push({ label: g.name, sub: g.provider, icon: 'shield', group: 'Guardrails', to: 'guardrails' }));
  SEED.budgetRules.forEach((r) => idx.push({ label: r.name, sub: 'budget rule', icon: 'money', group: 'Budgets', to: 'budgets' }));
  return idx;
}

function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

export function CommandPalette({ onClose, onNav }: { onClose: () => void; onNav: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const index = useMemo(buildIndex, []);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);

  const ql = q.trim().toLowerCase();
  const results = ql ? index.filter((r) => (r.label + ' ' + r.sub).toLowerCase().includes(ql)).slice(0, 50) : index.filter((r) => r.group === 'Pages');
  const groups: string[] = [];
  const byG: Record<string, IndexEntry[]> = {};
  results.forEach((r) => {
    if (!byG[r.group]) {
      byG[r.group] = [];
      groups.push(r.group);
    }
    byG[r.group]!.push(r);
  });
  const flat = groups.flatMap((g) => byG[g]!);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector('.cmdk-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (r?: IndexEntry) => {
    if (!r) return;
    onNav(r.to);
    onClose();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(flat[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let counter = -1;
  return (
    <div className="cmdk-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmdk" role="dialog">
        <div className="cmdk-search">
          {I('search', { size: 20, className: 'ki' })}
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search pages, providers, prompts, guardrails…" />
          <span className="kbd">Esc</span>
        </div>
        <div className="cmdk-results" ref={listRef}>
          {flat.length === 0 ? (
            <div className="cmdk-empty">No matches for “{q}”</div>
          ) : (
            groups.map((g) => (
              <div key={g}>
                <div className="cmdk-group">{g}</div>
                {byG[g]!.map((r) => {
                  counter++;
                  const idx = counter;
                  return (
                    <button key={g + idx} className={'cmdk-item ' + (active === idx ? 'active' : '')} onMouseEnter={() => setActive(idx)} onClick={() => go(r)}>
                      <span className="ci-ic">{I(r.icon, { size: 16 })}</span>
                      <span className="ci-tx">
                        <span className="ci-tt">{highlight(r.label, ql)}</span>
                        <span className="ci-sb">{r.sub}</span>
                      </span>
                      <span className="ci-go">{I('arrowRight', { size: 16 })}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmdk-foot">
          <span className="fk">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>navigate
          </span>
          <span className="fk">
            <span className="kbd">↵</span>open
          </span>
          <span className="fk" style={{ marginLeft: 'auto' }}>
            {flat.length} result{flat.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>
    </div>
  );
}
