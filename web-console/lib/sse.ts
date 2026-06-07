'use client';

/**
 * Subscribes to the BFF SSE bridge (`/api/stream`) with auto-reconnect.
 * Returns the latest payload for the given event plus a connected flag.
 */

import { useEffect, useRef, useState } from 'react';

export function useSSE<T>(eventName: string, initial: T): { data: T; connected: boolean } {
  const [data, setData] = useState<T>(initial);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (stopped) return;
      const es = new EventSource('/api/stream');
      esRef.current = es;
      es.onopen = () => setConnected(true);
      es.addEventListener(eventName, (e) => {
        try {
          setData(JSON.parse((e as MessageEvent).data) as T);
        } catch {
          /* ignore malformed frame */
        }
      });
      es.onerror = () => {
        setConnected(false);
        es.close();
        if (!stopped) retry = setTimeout(connect, 4000);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(retry);
      esRef.current?.close();
    };
  }, [eventName]);

  return { data, connected };
}
