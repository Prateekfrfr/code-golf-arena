import type { NextConfig } from "next";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

const backendOrigins = [
  process.env.NEXT_PUBLIC_API_URL,
  process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_SOCKET_URL,
].flatMap((value) => {
  if (!value) return [];

  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) return [];

    const origin = url.origin;
    const websocketOrigin = origin.startsWith('https:')
      ? origin.replace(/^https:/, 'wss:')
      : origin.startsWith('http:')
        ? origin.replace(/^http:/, 'ws:')
        : origin;

    return [origin, websocketOrigin];
  } catch {
    return [];
  }
});

const connectSources = [...new Set([
  "'self'",
  ...backendOrigins,
  'https://cloudflareinsights.com',
])].join(' ');
const isDev = process.env.NODE_ENV === 'development';
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://static.cloudflareinsights.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src ${connectSources}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "frame-ancestors 'none'",
].join('; ');

const nextConfig: NextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: contentSecurityPolicy,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
