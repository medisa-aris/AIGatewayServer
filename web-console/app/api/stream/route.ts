/**
 * SSE bridge — `/api/stream`.
 *
 * central-server has no native push, so the BFF polls `request-logs` every 5 s
 * and emits Server-Sent Events. Drives the live-throughput monitor and the
 * breathing heat strip. Cleans up on client disconnect.
 */

import { NextRequest } from 'next/server';
import { upstreamJson } from '@/lib/api/client';
import { COOKIE_NAME } from '@/app/api/auth/route';
import type { ListResponse, RequestLog } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const apiKey = req.cookies.get(COOKIE_NAME)?.value;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const poll = async () => {
        try {
          const res = await upstreamJson<ListResponse<RequestLog>>('/api/v1/request-logs?limit=50', {}, apiKey);
          send('request-logs', res.data ?? []);
        } catch {
          send('error', { message: 'poll failed' });
        }
      };

      // initial push + 5s polling + 15s keepalive
      void poll();
      const pollTimer = setInterval(() => void poll(), 5000);
      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(': keepalive\n\n'));
      }, 15000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
