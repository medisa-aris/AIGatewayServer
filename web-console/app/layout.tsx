/**
 * Root layout — loads global Carbon-derived styles and the theme provider.
 *
 * `data-theme` defaults to "light" here so the very first paint is themed;
 * the client ThemeProvider then reconciles with the persisted preference.
 * `suppressHydrationWarning` absorbs the attribute diff when that happens.
 */

import type { Metadata } from 'next';
import { ThemeProvider } from '@/lib/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pangreksa · AI Router Gateway',
  description: 'Pangreksa AI Router Gateway — management console',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light" data-density="compact" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
