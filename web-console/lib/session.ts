'use client';

/** Current session user, fetched from the BFF (`GET /api/auth`). */

import useSWR from 'swr';
import type { SessionUser } from '@/lib/types';

interface SessionResponse {
  authenticated: boolean;
  user?: SessionUser;
}

const fetcher = (url: string) => fetch(url).then((r) => (r.ok ? r.json() : { authenticated: false }));

/** Returns the logged-in user and a computed avatar initials string. */
export function useSession(): { user: SessionUser | null; initials: string } {
  const { data } = useSWR<SessionResponse>('/api/auth', fetcher, { revalidateOnFocus: false });
  const user = data?.user ?? null;
  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0]!.toUpperCase())
        .join('')
    : '··';
  return { user, initials };
}
