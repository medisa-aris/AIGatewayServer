/**
 * Provider connectivity probe — server-side only.
 *
 * Reads the raw provider account (including the unmasked api_key) directly
 * from central-server via server-to-server upstream(), then issues a real
 * HTTP request to the provider's health / models endpoint with a 5 s timeout.
 *
 * The raw key is NEVER forwarded to the browser; this route only returns
 * { connected: boolean, latencyMs: number }.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';
import type { ProviderAccount } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

/** Result shape returned to the browser. */
interface PingResult {
  connected: boolean;
  latencyMs: number;
}

/**
 * pingProvider issues a real HTTP request to the provider's API endpoint.
 * Any HTTP response (including 401 Unauthorized) counts as connected; only
 * network errors or timeouts count as offline.
 *
 * ctx — the provider account row read from central-server.
 */
async function pingProvider(acc: ProviderAccount): Promise<PingResult> {
  const start = Date.now();
  try {
    let url: string;
    const headers: Record<string, string> = {};

    switch (acc.provider_type) {
      case 'openai':
        url = 'https://api.openai.com/v1/models';
        if (acc.api_key) headers['Authorization'] = `Bearer ${acc.api_key}`;
        break;

      case 'anthropic':
        url = 'https://api.anthropic.com/v1/models';
        if (acc.api_key) headers['x-api-key'] = acc.api_key;
        headers['anthropic-version'] = '2023-06-01';
        break;

      case 'azure': {
        const extra = (acc.extra_config ?? {}) as Record<string, string>;
        const resource = extra.resource_name ?? '';
        const version  = extra.api_version  ?? '2024-02-01';
        url = `https://${resource}.openai.azure.com/openai/models?api-version=${version}`;
        if (acc.api_key) headers['api-key'] = acc.api_key;
        break;
      }

      case 'google':
        url = `https://generativelanguage.googleapis.com/v1beta/models${acc.api_key ? `?key=${acc.api_key}` : ''}`;
        break;

      case 'aws': {
        // AWS Bedrock requires SigV4 signing — we just check HTTPS reachability.
        const region = acc.region ?? 'us-east-1';
        url = `https://bedrock.${region}.amazonaws.com`;
        break;
      }

      case 'mistral':
        url = 'https://api.mistral.ai/v1/models';
        if (acc.api_key) headers['Authorization'] = `Bearer ${acc.api_key}`;
        break;

      case 'moonshot':
        url = 'https://api.moonshot.cn/v1/models';
        if (acc.api_key) headers['Authorization'] = `Bearer ${acc.api_key}`;
        break;

      case 'qwen':
        url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/models';
        if (acc.api_key) headers['Authorization'] = `Bearer ${acc.api_key}`;
        break;

      case 'perplexity':
        url = 'https://api.perplexity.ai/models';
        if (acc.api_key) headers['Authorization'] = `Bearer ${acc.api_key}`;
        break;

      case 'ollama':
        url = `${(acc.endpoint_url ?? 'http://localhost:11434').replace(/\/$/, '')}/api/tags`;
        break;

      default:
        return { connected: false, latencyMs: -1 };
    }

    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(5000),
    });

    // Only 2xx counts as connected — a 401/403 means the key is wrong.
    return { connected: res.ok, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: -1 };
  }
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const pat = req.cookies.get(COOKIE_NAME)?.value;

  try {
    // Read the raw account server-to-server (unmasked api_key, never sent to browser).
    const upstream_res = await upstream(`/api/v1/provider-accounts/${id}`, { method: 'GET' }, pat);
    if (!upstream_res.ok) {
      return NextResponse.json<PingResult>({ connected: false, latencyMs: -1 });
    }
    const envelope = (await upstream_res.json()) as { data: ProviderAccount };
    const result = await pingProvider(envelope.data);
    return NextResponse.json<PingResult>(result);
  } catch {
    return NextResponse.json<PingResult>({ connected: false, latencyMs: -1 });
  }
}
