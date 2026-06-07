import type { NextConfig } from 'next';

/**
 * Next.js configuration for the Pangreksa web-console.
 *
 * The browser only ever talks to this Next.js app (the BFF). The upstream
 * central-server URL is a server-only env var (never exposed with NEXT_PUBLIC_).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Surface a clear server-side default for the BFF proxy target.
  env: {
    CENTRAL_SERVER_URL: process.env.CENTRAL_SERVER_URL ?? 'http://localhost:10000',
  },
};

export default nextConfig;
