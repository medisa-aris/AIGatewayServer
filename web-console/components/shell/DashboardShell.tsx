'use client';

/**
 * Client shell that frames every dashboard route: header + collapsible side nav
 * + scrolling main + toasts + the floating Tweaks panel. The routed page is
 * passed as `children`.
 */

import { useState } from 'react';
import { useToasts } from '@/components/ui';
import { AppHeader } from './AppHeader';
import { SideNav } from './SideNav';
import { Tweaks } from './Tweaks';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [push, toastHost] = useToasts();

  return (
    <div className="shell">
      <AppHeader onMenu={() => setCollapsed((c) => !c)} push={push} />
      <div className="shell-body">
        <SideNav collapsed={collapsed} />
        <main className="main scroll">
          <div className="main-inner">{children}</div>
        </main>
      </div>
      {toastHost}
      <Tweaks />
    </div>
  );
}
