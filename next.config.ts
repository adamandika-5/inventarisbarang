import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Use Node.js runtime for routes requiring PDF/Excel generation
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb', // Allow Excel file uploads up to ~5MB + overhead
    },
  },
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            // NOTE: camera is allowed for barcode scanning feature
            // TODO(security): Restrict camera permission to only the scan page path when browser support improves
            value: 'camera=self, microphone=(), geolocation=()',
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'off',
          },
        ],
      },
      {
        // Prevent caching of sensitive pages
        source: '/(admin|employee)/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ]
  },
}

export default nextConfig
