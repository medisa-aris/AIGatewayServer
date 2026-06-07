/**
 * Proxy endpoint reachability probe — server-side only.
 *
 * Accepts ?url=http://127.0.0.1:PORT/health, issues a GET from the Next.js
 * server (avoids browser CORS restrictions), and returns { ok, status }.
 *
 * Any 2xx response → ok: true. Network errors / timeouts → ok: false.
 */

import { NextRequest, NextResponse } from 'next/server';

interface ProbeResult {
  ok:     boolean;
  status: number;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const raw = req.nextUrl.searchParams.get('url');
  if (!raw) {
    return NextResponse.json<ProbeResult>({ ok: false, status: 0 }, { status: 400 });
  }

  // Only allow http/https targets — refuse anything else.
  let target: URL;
  try {
    target = new URL(raw);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      return NextResponse.json<ProbeResult>({ ok: false, status: 0 }, { status: 400 });
    }
  } catch {
    return NextResponse.json<ProbeResult>({ ok: false, status: 0 }, { status: 400 });
  }

  try {
    const res = await fetch(target.toString(), {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json<ProbeResult>({ ok: res.ok, status: res.status });
  } catch {
    return NextResponse.json<ProbeResult>({ ok: false, status: 0 });
  }
}
