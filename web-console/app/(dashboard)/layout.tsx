/**
 * Dashboard layout — server-side auth gate.
 * Reads the HttpOnly `pat` cookie; redirects to /login when absent, then frames
 * the routed page with the client DashboardShell.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/shell/DashboardShell';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  if (!store.get('pat')?.value) redirect('/login');
  return <DashboardShell>{children}</DashboardShell>;
}
