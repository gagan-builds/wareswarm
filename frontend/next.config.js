/**
 * Purpose: Configuration settings for the Next.js frontend framework.
 * Role in the project: Configures build flags and environment variables exposed to the browser client.
 * Key contents: reactStrictMode, env (NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WS_URL defaults).
 * Talks to: Next.js build runtime, frontend/lib/api.ts, frontend/lib/useSimWebSocket.ts.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables extra React lifecycle checks during development to detect unintended side-effects
  reactStrictMode: true,
  // Default fallback URLs if environment variables are not injected at container start
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000',
  },
}

module.exports = nextConfig
