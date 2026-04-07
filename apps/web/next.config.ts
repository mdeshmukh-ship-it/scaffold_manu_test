import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  httpAgentOptions: { keepAlive: true },
  // Increase proxy timeout to 180s for AI agent calls (2 LLM calls + BigQuery)
  proxyTimeout: 180_000,
  async rewrites() {
    return [
      { source: '/graphql', destination: 'http://127.0.0.1:8001/graphql' },
      { source: '/api/:path*', destination: 'http://127.0.0.1:8001/api/:path*' },
      { source: '/graphiql', destination: 'http://127.0.0.1:8001/graphiql' },
    ]
  },
  serverExternalPackages: [],
}

export default nextConfig
