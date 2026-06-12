/**
 * Pure aggregation helpers shared by the BFF aggregate handlers.
 *
 * These run server-side over rows fetched with listAll() (paginated past the
 * 500-row per-request cap), so dashboard rollups reflect more than one page.
 */

import type { BudgetConsumption, GuardrailViolation, RequestLog, RouteLog } from '@/lib/types';

export interface DailyPoint {
  date: string;
  value: number;
}
export interface CategoryPoint {
  label: string;
  value: number;
}
export interface LatencyPercentiles {
  p50: number;
  p90: number;
  p99: number;
}

/** Sums budget consumption by calendar day for the last N days. */
export function costByDay(rows: BudgetConsumption[], days = 30): DailyPoint[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const buckets = new Map<string, number>();
  for (const c of rows) {
    const d = new Date(c.consumed_at);
    if (Number.isNaN(d.getTime()) || d < cutoff) continue;
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(c.amount ?? 0));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 100) / 100 }));
}

/** Counts request logs grouped by a string field, top N descending. */
function countBy<T>(rows: T[], pick: (r: T) => string | null | undefined, top = 8): CategoryPoint[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r) ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

export const requestsByModel = (rows: RequestLog[], top = 8) => countBy(rows, (r) => r.model_id, top);
export const requestsByEndpoint = (rows: RequestLog[], top = 8) => countBy(rows, (r) => r.path, top);
export const requestsByUser = (rows: RequestLog[], top = 8) => countBy(rows, (r) => r.user_id, top);
export const violationsByRule = (rows: GuardrailViolation[], top = 8) => countBy(rows, (r) => r.rule_type, top);

/** Hourly request counts (0–23) for a heat strip. */
export function heatStrip(rows: RequestLog[]): number[] {
  const cells = new Array<number>(24).fill(0);
  for (const r of rows) {
    const h = new Date(r.started_at).getHours();
    if (h >= 0 && h < 24) cells[h] = (cells[h] ?? 0) + 1;
  }
  return cells;
}

/** p50/p90/p99 over latency_ms. */
export function latencyPercentiles(rows: RequestLog[]): LatencyPercentiles {
  const values = rows.map((r) => Number(r.latency_ms ?? 0)).filter((v) => v > 0).sort((a, b) => a - b);
  if (values.length === 0) return { p50: 0, p90: 0, p99: 0 };
  const pct = (p: number) => values[Math.max(0, Math.ceil((p / 100) * values.length) - 1)] ?? 0;
  return { p50: pct(50), p90: pct(90), p99: pct(99) };
}

/** Sums cost by model_id, top N descending. */
export function costByModel(rows: RequestLog[], top = 8): CategoryPoint[] {
  const costs = new Map<string, number>();
  for (const r of rows) {
    const key = r.model_id ?? 'unknown';
    costs.set(key, (costs.get(key) ?? 0) + Number(r.cost ?? 0));
  }
  return [...costs.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

/* ── RouteLog aggregations (migration 014 route_logs table) ── */

/** Top-line KPIs computed from route_logs rows. */
export function routeLogKpis(logs: RouteLog[]) {
  const total = logs.length;
  const allowed = logs.filter((l) => l.status === 'allowed').length;
  const blocked = logs.filter((l) => l.status === 'blocked').length;
  const errors = logs.filter((l) => l.status === 'error').length;
  const latencies = logs.map((l) => Number(l.latency_ms ?? 0)).filter((v) => v > 0);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  const totalCost = logs.reduce((s, l) => s + Number(l.cost ?? 0), 0);
  const totalTokens = logs.reduce((s, l) => s + Number(l.prompt_tokens ?? 0) + Number(l.completion_tokens ?? 0), 0);
  return {
    total,
    allowed,
    blocked,
    errors,
    avgLatency,
    totalCost: Math.round(totalCost * 1e6) / 1e6,
    totalTokens,
    blockedRate: total ? Math.round((blocked / total) * 10000) / 100 : 0,
  };
}

export interface ModelMetricRow {
  modelId: string;
  requests: number;
  inTokens: number;
  outTokens: number;
  cost: number;
  p50: number;
  p90: number;
  p99: number;
  failRate: number;
}

/** Per-model stats from route_logs. */
export function modelMetrics(logs: RouteLog[], top = 50): ModelMetricRow[] {
  const byModel = new Map<string, { latencies: number[]; inTok: number; outTok: number; cost: number; fails: number; total: number }>();
  for (const l of logs) {
    const key = l.model_id ?? 'unknown';
    if (!byModel.has(key)) byModel.set(key, { latencies: [], inTok: 0, outTok: 0, cost: 0, fails: 0, total: 0 });
    const m = byModel.get(key)!;
    m.total++;
    m.inTok += Number(l.prompt_tokens ?? 0);
    m.outTok += Number(l.completion_tokens ?? 0);
    m.cost += Number(l.cost ?? 0);
    if (l.status !== 'allowed') m.fails++;
    const lat = Number(l.latency_ms ?? 0);
    if (lat > 0) m.latencies.push(lat);
  }
  const pct = (arr: number[], p: number) => {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
  };
  return [...byModel.entries()]
    .map(([modelId, m]) => ({
      modelId,
      requests: m.total,
      inTokens: m.inTok,
      outTokens: m.outTok,
      cost: Math.round(m.cost * 1e6) / 1e6,
      p50: pct(m.latencies, 50),
      p90: pct(m.latencies, 90),
      p99: pct(m.latencies, 99),
      failRate: m.total ? Math.round((m.fails / m.total) * 10000) / 100 : 0,
    }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, top);
}

/** Sums route_log cost by calendar day for the last N days. */
export function routeLogsByDay(logs: RouteLog[], days = 30): DailyPoint[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const buckets = new Map<string, number>();
  for (const l of logs) {
    const d = new Date(l.started_at);
    if (Number.isNaN(d.getTime()) || d < cutoff) continue;
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + Number(l.cost ?? 0));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, value]) => ({ date, value: Math.round(value * 1e6) / 1e6 }));
}

/** Top users by request count from route_logs. */
export function routeLogsByUser(logs: RouteLog[], top = 50): CategoryPoint[] {
  const counts = new Map<string, number>();
  for (const l of logs) {
    const key = l.user_id ?? 'unknown';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
}

/** Hourly heatstrip from route_logs.started_at. */
export function routeLogHeatStrip(logs: RouteLog[]): number[] {
  const cells = new Array<number>(24).fill(0);
  for (const l of logs) {
    const h = new Date(l.started_at).getHours();
    if (h >= 0 && h < 24) cells[h] = (cells[h] ?? 0) + 1;
  }
  return cells;
}

/** Top-line KPI counters computed from logs + consumptions. */
export function overviewKpis(logs: RequestLog[], consumptions: BudgetConsumption[]) {
  const totalRequests = logs.length;
  const totalCost = consumptions.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const errors = logs.filter((l) => (l.status_code ?? 0) >= 400).length;
  const latencies = logs.map((l) => Number(l.latency_ms ?? 0)).filter((v) => v > 0);
  const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const uniqueUsers = new Set(logs.map((l) => l.user_id).filter(Boolean)).size;
  const cached = logs.filter((l) => (l.cached_tokens ?? 0) > 0).length;
  return {
    totalRequests,
    totalCost: Math.round(totalCost * 100) / 100,
    errorRate: totalRequests ? Math.round((errors / totalRequests) * 10000) / 100 : 0,
    avgLatency: Math.round(avgLatency),
    uniqueUsers,
    cacheHitRate: totalRequests ? Math.round((cached / totalRequests) * 10000) / 100 : 0,
  };
}
