/**
 * Server-side client for the upstream central-server REST API.
 *
 * This module is imported ONLY by Route Handlers (the BFF). The browser never
 * imports it and never learns the upstream URL. The PAT (held as an HttpOnly
 * cookie) is attached here as the `X-API-Key` header.
 */

import type { ListResponse } from '@/lib/types';

export const CENTRAL_SERVER_URL = process.env.CENTRAL_SERVER_URL ?? 'http://localhost:10000';

/** Error carrying the upstream HTTP status so handlers can mirror it. */
export class UpstreamError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * Low-level fetch to central-server. Attaches the API key when provided and
 * always disables Next.js fetch caching (this is live operational data).
 */
export async function upstream(
  path: string,
  init: RequestInit = {},
  apiKey?: string,
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (apiKey) headers.set('X-API-Key', apiKey);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  return fetch(`${CENTRAL_SERVER_URL}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}

/** Upstream fetch that parses JSON and throws UpstreamError on non-2xx. */
export async function upstreamJson<T>(
  path: string,
  init: RequestInit = {},
  apiKey?: string,
): Promise<T> {
  const res = await upstream(path, init, apiKey);
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON upstream response
  }
  if (!res.ok) {
    throw new UpstreamError(res.status, `central-server ${res.status}`, json ?? text);
  }
  return json as T;
}

/**
 * Fetches up to `max` rows of a resource by paginating the upstream API in
 * pages of 500 (the documented per-request cap). Used by aggregation handlers
 * to exceed the analytics cap server-side.
 */
export async function listAll<T>(
  resource: string,
  opts: { max?: number; params?: Record<string, string>; apiKey?: string } = {},
): Promise<T[]> {
  const { max = 2000, params = {}, apiKey } = opts;
  const pageSize = 500;
  const out: T[] = [];
  for (let offset = 0; offset < max; offset += pageSize) {
    const qs = new URLSearchParams({ ...params, limit: String(pageSize), offset: String(offset) });
    const page = await upstreamJson<ListResponse<T>>(`/api/v1/${resource}?${qs.toString()}`, {}, apiKey);
    const rows = page?.data ?? [];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}
