/**
 * Public stats BFF endpoint — `/api/public-stats`.
 *
 * Feeds the four headline figures on the login (brand) panel. This is the one
 * BFF route reachable pre-auth: the login screen has no PAT yet, so it fetches
 * upstream WITHOUT an `X-API-Key` (the central-server is open — see CLAUDE.md).
 *
 * Only aggregate, non-sensitive figures are exposed (counts, an error %, a spend
 * total, a distinct-model count) — the same vanity numbers already printed on the
 * login page, now computed from real data. On any upstream failure it returns the
 * static fallbacks so the login screen never blanks.
 */

import { NextResponse } from 'next/server';
import { listAll } from '@/lib/api/client';
import type { BudgetConsumption, RequestLog } from '@/lib/types';

type Stat = { value: string; label: string };

// Static fallbacks — mirror the design's placeholder figures.
const FALLBACK: Stat[] = [
  { value: '48.6M', label: 'calls / day' },
  { value: '0.42%', label: 'error rate' },
  { value: '$1.2M', label: 'spend / day' },
  { value: '1,000+', label: 'models' },
];

/** Compact number: 1234 → "1.2k", 4_800_000 → "4.8M". */
function compact(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

/** Count rows whose timestamp falls within 24h of the most recent row. */
function lastDayCount<T>(rows: T[], ts: (r: T) => string | null): number {
  let latest = 0;
  for (const r of rows) {
    const t = Date.parse(ts(r) ?? '');
    if (!Number.isNaN(t) && t > latest) latest = t;
  }
  if (!latest) return rows.length;
  const cutoff = latest - 24 * 60 * 60 * 1000;
  return rows.filter((r) => Date.parse(ts(r) ?? '') >= cutoff).length;
}

export async function GET(): Promise<NextResponse> {
  try {
    const [logs, cons] = await Promise.all([
      listAll<RequestLog>('request-logs', { max: 5000 }),
      listAll<BudgetConsumption>('budget-consumptions', { max: 5000 }),
    ]);

    const total = logs.length;
    const errors = logs.filter((l) => (l.status_code ?? 0) >= 400).length;
    const errorRate = total ? (errors / total) * 100 : 0;
    const callsPerDay = lastDayCount(logs, (l) => l.started_at);

    const latestSpend = cons.reduce((m, c) => Math.max(m, Date.parse(c.consumed_at ?? '') || 0), 0);
    const spendCutoff = latestSpend - 24 * 60 * 60 * 1000;
    const spend = cons
      .filter((c) => !latestSpend || Date.parse(c.consumed_at ?? '') >= spendCutoff)
      .reduce((s, c) => s + Number(c.amount ?? 0), 0);
    const models = new Set(logs.map((l) => l.model_id).filter(Boolean)).size;

    const stats: Stat[] = [
      { value: compact(callsPerDay), label: 'calls / day' },
      { value: `${(Math.round(errorRate * 100) / 100).toFixed(2)}%`, label: 'error rate' },
      { value: `$${compact(Math.round(spend))}`, label: 'spend / day' },
      { value: String(models), label: 'models' },
    ];

    return NextResponse.json({ stats });
  } catch {
    return NextResponse.json({ stats: FALLBACK });
  }
}
