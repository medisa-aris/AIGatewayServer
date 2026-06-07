/**
 * Provider model list — server-side only.
 *
 * Calls the upstream provider's models endpoint and returns a normalised list.
 * The raw API key is NEVER forwarded to the browser.
 *
 * GET /api/providers/:id/models → { models: RemoteModel[], error?: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';
import type { ProviderAccount } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

/** Normalised model entry returned to the browser. */
export interface RemoteModel {
  id: string;
  name: string;
}

interface ModelsResult {
  models: RemoteModel[];
  error?: string;
}

/**
 * listModels calls the provider's model-list endpoint and normalises the
 * response into a flat array of { id, name } pairs.
 *
 * acc — provider account row from central-server (includes raw api_key).
 */
async function listModels(acc: ProviderAccount): Promise<RemoteModel[]> {
  const headers: Record<string, string> = {};
  let url: string;

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
      return [];
  }

  const res = await fetch(url, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) throw new Error(`Provider returned ${res.status}`);

  const body = (await res.json()) as Record<string, unknown>;

  switch (acc.provider_type) {
    case 'ollama': {
      const models = (body.models as Array<{ name: string }>) ?? [];
      return models.map((m) => ({ id: m.name, name: m.name }));
    }

    case 'google': {
      const models = (body.models as Array<{ name: string; displayName?: string }>) ?? [];
      return models.map((m) => ({
        id: m.name.replace(/^models\//, ''),
        name: m.displayName ?? m.name.replace(/^models\//, ''),
      }));
    }

    case 'anthropic': {
      const data = (body.data as Array<{ id: string; display_name?: string }>) ?? [];
      return data.map((m) => ({ id: m.id, name: m.display_name ?? m.id }));
    }

    default: {
      // OpenAI-compatible format: { data: [{ id }] }
      const data = (body.data as Array<{ id: string }>) ?? [];
      return data.map((m) => ({ id: m.id, name: m.id }));
    }
  }
}

export async function GET(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const pat = req.cookies.get(COOKIE_NAME)?.value;

  try {
    const upstream_res = await upstream(`/api/v1/provider-accounts/${id}`, { method: 'GET' }, pat);
    if (!upstream_res.ok) {
      return NextResponse.json<ModelsResult>({ models: [], error: 'Provider account not found' });
    }
    const envelope = (await upstream_res.json()) as { data: ProviderAccount };
    const models = await listModels(envelope.data);
    return NextResponse.json<ModelsResult>({ models });
  } catch (e) {
    return NextResponse.json<ModelsResult>({
      models: [],
      error: e instanceof Error ? e.message : 'Failed to fetch models from provider',
    });
  }
}
