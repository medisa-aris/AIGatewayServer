/**
 * Auth BFF endpoint.
 *
 *   POST   /api/auth  — validate an API key, set the HttpOnly `pat` cookie
 *   DELETE /api/auth  — clear the cookie (logout)
 *   GET    /api/auth  — report whether a session cookie is present
 *
 * The raw key is SHA-256 hashed and compared against `api_keys.key_hash`
 * upstream. The raw key is then stored server-side as an HttpOnly cookie and
 * never re-exposed to the browser; the BFF replays it as `X-API-Key`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstreamJson } from '@/lib/api/client';
import type { ApiKey, ItemResponse, ListResponse, Organization, SessionUser, User } from '@/lib/types';

export const COOKIE_NAME = 'pat';
const COOKIE_MAX_AGE = 60 * 60 * 24; // 24h

/** SHA-256 hex digest of a string, via Web Crypto. */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let apiKey: string;
  try {
    const body = (await req.json()) as { apiKey?: unknown };
    if (typeof body.apiKey !== 'string' || body.apiKey.trim() === '') {
      return NextResponse.json({ error: 'apiKey is required' }, { status: 400 });
    }
    apiKey = body.apiKey.trim();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const hexHash = await sha256Hex(apiKey);

  let keys: ApiKey[];
  try {
    const res = await upstreamJson<ListResponse<ApiKey>>('/api/v1/api-keys?limit=500');
    keys = res.data ?? [];
  } catch {
    return NextResponse.json({ error: 'Could not reach central server' }, { status: 502 });
  }

  const matched = keys.find((k) => k.key_hash === hexHash && k.is_active === true);
  if (!matched) {
    return NextResponse.json({ error: 'Invalid or inactive API key' }, { status: 401 });
  }

  let user: User | null = null;
  try {
    const res = await upstreamJson<ItemResponse<User>>(`/api/v1/users/${matched.user_id}`);
    user = res.data;
  } catch {
    // non-fatal: proceed without profile details
  }

  let org: Organization | null = null;
  try {
    const o = await upstreamJson<ItemResponse<Organization>>(`/api/v1/organizations/${matched.org_id}`);
    org = o.data;
  } catch {
    /* non-fatal */
  }

  const sessionUser: SessionUser = {
    userId: matched.user_id,
    orgId: matched.org_id,
    name: user?.name ?? 'Unknown',
    email: user?.email ?? '',
    orgName: org?.name,
  };

  const response = NextResponse.json(sessionUser, { status: 200 });
  response.cookies.set(COOKIE_NAME, apiKey, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  });
  return response;
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return response;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ authenticated: false }, { status: 401 });

  // Resolve the session user from the cookie's key (so the UI shows who is
  // actually logged in, not a hardcoded seed identity).
  try {
    const hexHash = await sha256Hex(token);
    const res = await upstreamJson<ListResponse<ApiKey>>('/api/v1/api-keys?limit=500');
    const matched = (res.data ?? []).find((k) => k.key_hash === hexHash && k.is_active === true);
    if (!matched) return NextResponse.json({ authenticated: false }, { status: 401 });

    let user: User | null = null;
    try {
      const u = await upstreamJson<ItemResponse<User>>(`/api/v1/users/${matched.user_id}`);
      user = u.data;
    } catch {
      /* non-fatal */
    }
    let org: Organization | null = null;
    try {
      const o = await upstreamJson<ItemResponse<Organization>>(`/api/v1/organizations/${matched.org_id}`);
      org = o.data;
    } catch {
      /* non-fatal */
    }
    const sessionUser: SessionUser = {
      userId: matched.user_id,
      orgId: matched.org_id,
      name: user?.name ?? 'Unknown',
      email: user?.email ?? '',
      orgName: org?.name,
    };
    return NextResponse.json({ authenticated: true, user: sessionUser });
  } catch {
    // Upstream unreachable — treat as authenticated (cookie present) but no profile.
    return NextResponse.json({ authenticated: true });
  }
}
