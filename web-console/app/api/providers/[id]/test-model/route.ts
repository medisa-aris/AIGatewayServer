/**
 * Model inference test — server-side only.
 *
 * POST /api/providers/:id/test-model
 * Body: { model_id: string; prompt: string }
 *
 * Reads the raw provider account (including unmasked api_key) from central-server,
 * issues a single-turn chat completion to the upstream provider, and returns
 * { answer: string } or { answer: '', error: string }.
 *
 * The raw API key is NEVER forwarded to the browser.
 */

import { NextRequest, NextResponse } from 'next/server';
import { upstream } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';
import type { ProviderAccount } from '@/lib/types';

type Ctx = { params: Promise<{ id: string }> };

interface TestBody {
  model_id: string;
  prompt: string;
}

interface TestResult {
  answer: string;
  error?: string;
}

/**
 * True for OpenAI o1/o3/o4 reasoning-series models.
 * These require `max_completion_tokens` (not `max_tokens`) and don't accept `temperature`.
 * All other current OpenAI chat models also accept `max_completion_tokens` as the new standard.
 */
function isOpenAIReasoningModel(model_id: string): boolean {
  return /^o[1-9][-\s]/.test(model_id) || /^o[1-9]$/.test(model_id);
}

async function callProvider(acc: ProviderAccount, model_id: string, prompt: string): Promise<string> {
  const timeout = AbortSignal.timeout(30_000);

  switch (acc.provider_type) {
    /* ── OpenAI ──────────────────────────────────────────────────────────────
     * Payload spec: https://platform.openai.com/docs/api-reference/chat/create
     *
     * OpenAI deprecated `max_tokens` in favour of `max_completion_tokens` for
     * all chat models from gpt-4o onward (2024-10). Reasoning models (o1/o3/o4)
     * never accepted `max_tokens` at all. We always send `max_completion_tokens`
     * so both legacy and modern models work with one payload.
     *
     * Reasoning models additionally reject `temperature`/`top_p` — omit them.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'openai': {
      const reasoning = isOpenAIReasoningModel(model_id);
      const body: Record<string, unknown> = {
        model:                  model_id,
        messages:               [{ role: 'user', content: prompt }],
        max_completion_tokens:  1024,
      };
      if (!reasoning) {
        body.temperature = 1;   // default; omitted for reasoning models
      }
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { Authorization: `Bearer ${acc.api_key}` } : {}),
        },
        body:   JSON.stringify(body),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`OpenAI returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Anthropic ───────────────────────────────────────────────────────────
     * Payload spec: https://docs.anthropic.com/en/api/messages
     *
     * `max_tokens` is required by Anthropic (no alternative name).
     * Header `anthropic-version` is mandatory.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'anthropic': {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method:  'POST',
        headers: {
          'Content-Type':      'application/json',
          'anthropic-version': '2023-06-01',
          ...(acc.api_key ? { 'x-api-key': acc.api_key } : {}),
        },
        body: JSON.stringify({
          model:      model_id,
          max_tokens: 1024,           // required field for Anthropic
          messages:   [{ role: 'user', content: prompt }],
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Anthropic returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { content: Array<{ type: string; text: string }> };
      return data.content?.find((b) => b.type === 'text')?.text ?? '';
    }

    /* ── Azure OpenAI ────────────────────────────────────────────────────────
     * Payload spec: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
     *
     * Azure api-version >= 2024-10-01-preview supports `max_completion_tokens`.
     * Older versions (2024-02-01, 2024-05-01-preview) only support `max_tokens`.
     * We compare the version string lexicographically to decide which to use.
     * The deployment name in the URL path acts as the model selector; no `model`
     * field is needed in the body (Azure ignores it if present).
     * ─────────────────────────────────────────────────────────────────────── */
    case 'azure': {
      const extra    = (acc.extra_config ?? {}) as Record<string, string>;
      const resource = extra.resource_name ?? '';
      const version  = extra.api_version  ?? '2024-02-01';
      const deploy   = model_id;
      const url      = `https://${resource}.openai.azure.com/openai/deployments/${deploy}/chat/completions?api-version=${version}`;

      // api-version >= 2024-10-01 → new parameter name; older → legacy name
      const useNewTokenParam = version >= '2024-10-01';
      const tokenKey = useNewTokenParam ? 'max_completion_tokens' : 'max_tokens';

      const res = await fetch(url, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { 'api-key': acc.api_key } : {}),
        },
        body:   JSON.stringify({ messages: [{ role: 'user', content: prompt }], [tokenKey]: 1024 }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Azure OpenAI returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Google Gemini ───────────────────────────────────────────────────────
     * Payload spec: https://ai.google.dev/api/generate-content
     *
     * Token limit goes inside `generationConfig.maxOutputTokens` (not a top-level field).
     * API key is passed as a query param; Vertex AI would use Bearer auth instead.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'google': {
      const keyParam = acc.api_key ? `?key=${acc.api_key}` : '';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model_id}:generateContent${keyParam}`;
      const res = await fetch(url, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents:         [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1024 },
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Google returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    /* ── Mistral ─────────────────────────────────────────────────────────────
     * Payload spec: https://docs.mistral.ai/api/#tag/chat/operation/chat_completion_v1_chat_completions_post
     *
     * OpenAI-compatible format; uses `max_tokens`.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'mistral': {
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { Authorization: `Bearer ${acc.api_key}` } : {}),
        },
        body: JSON.stringify({
          model:      model_id,
          messages:   [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Mistral returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Moonshot (Kimi) ─────────────────────────────────────────────────────
     * Payload spec: https://platform.moonshot.cn/docs/api/chat
     *
     * OpenAI-compatible format; uses `max_tokens`.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'moonshot': {
      const res = await fetch('https://api.moonshot.cn/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { Authorization: `Bearer ${acc.api_key}` } : {}),
        },
        body: JSON.stringify({
          model:      model_id,
          messages:   [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Moonshot returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Qwen (Alibaba DashScope) ────────────────────────────────────────────
     * Payload spec: https://www.alibabacloud.com/help/en/model-studio/developer-reference/use-qwen-by-calling-api
     *
     * Uses the OpenAI-compatible endpoint on DashScope; `max_tokens` is accepted.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'qwen': {
      const res = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { Authorization: `Bearer ${acc.api_key}` } : {}),
        },
        body: JSON.stringify({
          model:      model_id,
          messages:   [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Qwen returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Perplexity ──────────────────────────────────────────────────────────
     * Payload spec: https://docs.perplexity.ai/api-reference/chat-completions
     *
     * OpenAI-compatible format; uses `max_tokens`.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'perplexity': {
      const res = await fetch('https://api.perplexity.ai/chat/completions', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(acc.api_key ? { Authorization: `Bearer ${acc.api_key}` } : {}),
        },
        body: JSON.stringify({
          model:      model_id,
          messages:   [{ role: 'user', content: prompt }],
          max_tokens: 1024,
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Perplexity returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return data.choices?.[0]?.message?.content ?? '';
    }

    /* ── Ollama ──────────────────────────────────────────────────────────────
     * Payload spec: https://github.com/ollama/ollama/blob/main/docs/api.md#generate-a-chat-completion
     *
     * Uses the /api/chat endpoint with stream: false for a single synchronous response.
     * Token limits go in `options.num_predict` (not max_tokens).
     * ─────────────────────────────────────────────────────────────────────── */
    case 'ollama': {
      const base = (acc.endpoint_url ?? 'http://localhost:11434').replace(/\/$/, '');
      const res = await fetch(`${base}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:    model_id,
          messages: [{ role: 'user', content: prompt }],
          stream:   false,
          options:  { num_predict: 1024 },
        }),
        signal: timeout,
      });
      if (!res.ok) throw new Error(`Ollama returned ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { message: { content: string } };
      return data.message?.content ?? '';
    }

    /* ── AWS Bedrock ─────────────────────────────────────────────────────────
     * Requires AWS SigV4 request signing — not implementable without AWS SDK /
     * credentials. Inform the user clearly.
     * ─────────────────────────────────────────────────────────────────────── */
    case 'aws':
      throw new Error('AWS Bedrock requires SigV4 request signing and is not supported by the inline test tool. Use the AWS console or CLI to test this model.');

    default:
      throw new Error(`Unknown provider type: ${acc.provider_type}`);
  }
}

export async function POST(req: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { id } = await ctx.params;
  const pat = req.cookies.get(COOKIE_NAME)?.value;

  let body: TestBody;
  try {
    body = (await req.json()) as TestBody;
  } catch {
    return NextResponse.json<TestResult>({ answer: '', error: 'Invalid request body' }, { status: 400 });
  }

  const { model_id, prompt } = body;
  if (!model_id || !prompt) {
    return NextResponse.json<TestResult>({ answer: '', error: 'model_id and prompt are required' }, { status: 400 });
  }

  try {
    const upstream_res = await upstream(`/api/v1/provider-accounts/${id}`, { method: 'GET' }, pat);
    if (!upstream_res.ok) {
      return NextResponse.json<TestResult>({ answer: '', error: 'Provider account not found' });
    }
    const envelope = (await upstream_res.json()) as { data: ProviderAccount };
    const answer = await callProvider(envelope.data, model_id, prompt);
    return NextResponse.json<TestResult>({ answer });
  } catch (e) {
    return NextResponse.json<TestResult>({
      answer: '',
      error: e instanceof Error ? e.message : 'Test failed',
    });
  }
}
