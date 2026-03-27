const withNextIntl = require('next-intl/plugin')(
  './i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/kms',
  output: 'standalone',

  // Tell Next.js to transpile @kb/ui through its SWC pipeline.
  // Without this, Next.js would try to load raw TS from packages/ui and fail.
  transpilePackages: ['@kb/ui'],

  // Prevent the Next.js Router Cache from serving stale route data
  // for dynamically-rendered pages (pages that depend on cookies/headers).
  // Setting dynamic to 0 means prefetch data for protected routes is always
  // refetched from the server, ensuring auth state is always current.
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },

  // Enable Turbopack config to avoid errors
  turbopack: {},

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.KMS_API_URL || 'http://kms-api:8000'}/api/:path*`,
      },
    ];
  },
  // Enable polling for file watching (required for Podman on macOS)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300,
      };
    }
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
