'use client';

/**
 * Client-side API layer. All calls are SAME-ORIGIN to the BFF (`/api/*`);
 * the browser never talks to central-server directly. The BFF attaches auth,
 * proxies, validates writes, and aggregates.
 */

import type { ItemResponse, ListResponse } from '@/lib/types';

/** Error carrying the HTTP status and optional offending field (from BFF validation). */
export class ApiError extends Error {
  status: number;
  field?: string;
  constructor(status: number, message: string, field?: string) {
    super(message);
    this.status = status;
    if (field) this.field = field;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const obj = (json ?? {}) as { error?: string; field?: string };
    throw new ApiError(res.status, obj.error ?? `Request failed (${res.status})`, obj.field);
  }
  return json as T;
}

export type QueryParams = Record<string, string | number | undefined>;

function qs(params?: QueryParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v != null) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `?${s}` : '';
}

/** GET a list of a resource (defaults to the 500-row max). */
export async function listResource<T>(resource: string, params?: QueryParams): Promise<ListResponse<T>> {
  const res = await fetch(`/api/v1/${resource}${qs({ limit: 500, ...params })}`, { cache: 'no-store' });
  return parse<ListResponse<T>>(res);
}

/** GET a single resource by id. */
export async function getResource<T>(resource: string, id: string): Promise<T> {
  const res = await fetch(`/api/v1/${resource}/${id}`, { cache: 'no-store' });
  return (await parse<ItemResponse<T>>(res)).data;
}

/** POST a new resource. */
export async function createResource<T>(resource: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/v1/${resource}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await parse<ItemResponse<T>>(res)).data;
}

/** PATCH an existing resource. */
export async function updateResource<T>(resource: string, id: string, payload: Record<string, unknown>): Promise<T> {
  const res = await fetch(`/api/v1/${resource}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return (await parse<ItemResponse<T>>(res)).data;
}

/** DELETE a resource by id. */
export async function deleteResource(resource: string, id: string): Promise<void> {
  const res = await fetch(`/api/v1/${resource}/${id}`, { method: 'DELETE' });
  if (!res.ok) await parse(res);
}

/** GET a server-side aggregate metric. */
export async function getAggregate<T>(metric: string, params?: QueryParams): Promise<T> {
  const res = await fetch(`/api/aggregate/${metric}${qs(params)}`, { cache: 'no-store' });
  return (await parse<ItemResponse<T>>(res)).data;
}
