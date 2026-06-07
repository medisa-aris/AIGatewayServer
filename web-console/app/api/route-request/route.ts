/**
 * Route-request BFF endpoint.
 *
 * POST /api/route-request
 *
 * Proxies a live RouteRequest execution to the central-server
 * POST /api/v1/route-request endpoint. Unlike the dry-run /api/route-test,
 * this endpoint actually calls the upstream LLM provider and writes audit
 * records (route_logs, request_logs, budget_consumptions).
 *
 * Identity resolution (mutually exclusive):
 *   - keyId  — api_keys.id UUID, used by the Testing modal dropdown.
 *   - apiKey — raw API key, used by programmatic/curl callers.
 *
 * The session PAT is injected as X-API-Key to authorise the call to the
 * central-server, as per the BFF pattern described in CLAUDE.md.
 *
 * Request body:
 *   { keyId?: string; apiKey?: string; message?: string; endpointId: string; mcpServerId?: string }
 *
 * Response (mirrors central-server, forwarded as-is):
 *   RouteRequestResult — { route_log_id, request_id, allowed, status, output,
 *                          checks[], prompt_tokens, completion_tokens, cost,
 *                          latency_ms, error_message? }
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream, UpstreamError } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';

interface RouteRequestBody {
  /** api_keys.id UUID — used by the Testing modal dropdown */
  keyId?: string;
  /** raw API key — used by programmatic callers */
  apiKey?: string;
  message?: string;
  endpointId?: string;
  mcpServerId?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RouteRequestBody;
  try {
    body = (await req.json()) as RouteRequestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const keyId  = body.keyId?.trim()  ?? '';
  const apiKey = body.apiKey?.trim() ?? '';

  if (!keyId && !apiKey) {
    return NextResponse.json({ error: 'keyId or apiKey is required' }, { status: 400 });
  }
  if (!body.endpointId?.trim()) {
    return NextResponse.json({ error: 'endpointId is required' }, { status: 400 });
  }

  const sessionKey = req.cookies.get(COOKIE_NAME)?.value;

  const upstreamBody = JSON.stringify({
    api_key:       apiKey,
    api_key_id:    keyId,
    message:       body.message       ?? '',
    endpoint_id:   body.endpointId.trim(),
    mcp_server_id: body.mcpServerId   ?? '',
  });

  try {
    const res = await upstream(
      '/api/v1/route-request',
      { method: 'POST', body: upstreamBody },
      sessionKey,
    );
    const text = await res.text();
    return new NextResponse(text || null, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    if (e instanceof UpstreamError) {
      return NextResponse.json({ error: e.message, body: e.body }, { status: e.status });
    }
    return NextResponse.json({ error: 'Could not reach central server' }, { status: 502 });
  }
}
