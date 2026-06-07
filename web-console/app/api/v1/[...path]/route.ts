/**
 * Generic resource proxy (the BFF core).
 *
 * Forwards GET/POST/PATCH/PUT/DELETE for any `/api/v1/<resource>[/<id>]` to
 * central-server, injecting the `X-API-Key` from the HttpOnly cookie. Write
 * verbs are validated here first (central-server has no validation layer), so
 * even a direct call can't bypass the field rules.
 *
 * One handler covers all 34 catalog resources — matching central-server's own
 * generic-catalog design.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream, UpstreamError } from '@/lib/api/client';
import { validate } from '@/lib/validation';
import { COOKIE_NAME } from '@/app/api/auth/route';

/**
 * Masks the api_key field in provider-accounts responses so the raw key is
 * never sent to the browser. Replaces the full key with "...XXXX" (last 4
 * chars) so the UI can show a recognisable hint without exposing the secret.
 */
function maskProviderAccounts(resource: string, text: string): string {
  if (resource !== 'provider-accounts' || !text) return text;
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const maskRow = (row: Record<string, unknown>) => {
      if (typeof row.api_key === 'string' && row.api_key.length > 0) {
        row.api_key = '...' + row.api_key.slice(-4);
      }
    };
    if (Array.isArray((body as { data?: unknown }).data)) {
      for (const row of (body as { data: Record<string, unknown>[] }).data) maskRow(row);
    } else if (body.data && typeof body.data === 'object') {
      maskRow(body.data as Record<string, unknown>);
    }
    return JSON.stringify(body);
  } catch {
    return text;
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

/** Builds the upstream `/api/v1/...` path + query from the incoming request. */
function upstreamPath(segments: string[], req: NextRequest): string {
  const qs = req.nextUrl.search; // includes leading '?' or ''
  return `/api/v1/${segments.map(encodeURIComponent).join('/')}${qs}`;
}

function apiKey(req: NextRequest): string | undefined {
  return req.cookies.get(COOKIE_NAME)?.value;
}

async function proxy(req: NextRequest, segments: string[], method: string): Promise<NextResponse> {
  const resource = segments[0] ?? '';
  let bodyText: string | undefined;

  if (method === 'POST' || method === 'PATCH' || method === 'PUT') {
    bodyText = await req.text();
    if (bodyText) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(bodyText) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
      const err = validate(resource, parsed, method !== 'POST');
      if (err) {
        return NextResponse.json({ error: err.error, field: err.field }, { status: 400 });
      }
      // Fill columns that are NOT NULL upstream but optional in our forms.
      if (method === 'POST' && resource === 'users' && !parsed.external_id) {
        parsed.external_id = parsed.email; // unique, non-null fallback for local users
        bodyText = JSON.stringify(parsed);
      }
    }
  }

  try {
    const res = await upstream(
      upstreamPath(segments, req),
      { method, ...(bodyText ? { body: bodyText } : {}) },
      apiKey(req),
    );
    let text = await res.text();
    text = maskProviderAccounts(resource, text);
    return new NextResponse(text || null, {
      status: res.status,
      headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
    });
  } catch (e) {
    if (e instanceof UpstreamError) {
      return NextResponse.json({ error: e.message, body: e.body }, { status: e.status });
    }
    return NextResponse.json({ error: 'Could not reach central server' }, { status: 502 });
  }
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path, 'GET');
}
export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path, 'POST');
}
export async function PATCH(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path, 'PATCH');
}
export async function PUT(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path, 'PUT');
}
export async function DELETE(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  return proxy(req, (await ctx.params).path, 'DELETE');
}
