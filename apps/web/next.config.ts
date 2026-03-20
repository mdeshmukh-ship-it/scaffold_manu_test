import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Increase proxy timeout to 120s so slow BigQuery queries don't get dropped
  httpAgentOptions: { keepAlive: true },
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
