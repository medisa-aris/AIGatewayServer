/**
 * Aggregation BFF endpoint — `/api/aggregate/<metric>`.
 *
 * Each metric paginates central-server server-side (listAll) so dashboard
 * rollups exceed the 500-row per-request analytics cap. Returns `{ data }`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { listAll } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';
import * as agg from '@/lib/api/aggregations';
import type { BudgetConsumption, GuardrailViolation, RequestLog } from '@/lib/types';

type Ctx = { params: Promise<{ metric: string }> };

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { metric } = await ctx.params;
  const apiKey = req.cookies.get(COOKIE_NAME)?.value;
  const max = Math.min(5000, Number(req.nextUrl.searchParams.get('max') ?? 2000) || 2000);

  try {
    switch (metric) {
      case 'overview': {
        const [logs, cons] = await Promise.all([
          listAll<RequestLog>('request-logs', { max, apiKey }),
          listAll<BudgetConsumption>('budget-consumptions', { max, apiKey }),
        ]);
        return NextResponse.json({
          data: {
            kpis: agg.overviewKpis(logs, cons),
            costByDay: agg.costByDay(cons, 30),
            requestsByModel: agg.requestsByModel(logs),
            requestsByEndpoint: agg.requestsByEndpoint(logs),
            topUsers: agg.requestsByUser(logs),
            heatStrip: agg.heatStrip(logs),
          },
        });
      }
      case 'cost-by-day': {
        const cons = await listAll<BudgetConsumption>('budget-consumptions', { max, apiKey });
        return NextResponse.json({ data: agg.costByDay(cons, 30) });
      }
      case 'requests-by-model': {
        const logs = await listAll<RequestLog>('request-logs', { max, apiKey });
        return NextResponse.json({ data: agg.requestsByModel(logs) });
      }
      case 'cost-by-model': {
        const logs = await listAll<RequestLog>('request-logs', { max, apiKey });
        return NextResponse.json({ data: agg.costByModel(logs) });
      }
      case 'latency-percentiles': {
        const logs = await listAll<RequestLog>('request-logs', { max, apiKey });
        return NextResponse.json({ data: agg.latencyPercentiles(logs) });
      }
      case 'heat-strip': {
        const logs = await listAll<RequestLog>('request-logs', { max, apiKey });
        return NextResponse.json({ data: agg.heatStrip(logs) });
      }
      case 'violations-by-rule': {
        const v = await listAll<GuardrailViolation>('guardrail-violations', { max, apiKey });
        return NextResponse.json({ data: agg.violationsByRule(v) });
      }
      default:
        return NextResponse.json({ error: `Unknown metric: ${metric}` }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Aggregation failed (central server unreachable?)' }, { status: 502 });
  }
}
