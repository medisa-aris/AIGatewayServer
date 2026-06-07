/**
 * Route-test BFF endpoint.
 *
 * POST /api/route-test
 *
 * Proxies a dry-run routing and guardrail validation request to the
 * central-server POST /api/v1/route-test endpoint.
 *
 * Identity resolution (mutually exclusive):
 *   - keyId  — api_keys.id UUID, used by the Testing modal dropdown.
 *     The raw key is never stored so only the UUID is available there.
 *   - apiKey — raw API key, used by programmatic/curl callers.
 *
 * The session PAT is injected as X-API-Key to authorise the call to the
 * central-server, as per the BFF pattern described in CLAUDE.md.
 *
 * Request body:
 *   { keyId?: string; apiKey?: string; message?: string; mcpServerId?: string; endpointId?: string }
 *
 * Response (mirrors central-server, forwarded as-is):
 *   RouteTestReport — { allowed, user_id, org_id, checks[] }
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream, UpstreamError } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';

interface RouteTestBody {
  /** api_keys.id UUID — used by the Testing modal dropdown */
  keyId?: string;
  /** raw API key — used by programmatic callers */
  apiKey?: string;
  message?: string;
  mcpServerId?: string;
  endpointId?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RouteTestBody;
  try {
    body = (await req.json()) as RouteTestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const keyId  = body.keyId?.trim()  ?? '';
  const apiKey = body.apiKey?.trim() ?? '';

  if (!keyId && !apiKey) {
    return NextResponse.json({ error: 'keyId or apiKey is required' }, { status: 400 });
  }

  const sessionKey = req.cookies.get(COOKIE_NAME)?.value;

  // Re-map camelCase fields to the snake_case the Go handler expects.
  // Send only the identity field that was provided (the other stays '').
  const upstream_body = JSON.stringify({
    api_key:       apiKey,
    api_key_id:    keyId,
    message:       body.message     ?? '',
    mcp_server_id: body.mcpServerId ?? '',
    endpoint_id:   body.endpointId  ?? '',
  });

  try {
    const res = await upstream(
      '/api/v1/route-test',
      { method: 'POST', body: upstream_body },
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
