const withNextIntl = require('next-intl/plugin')(
  './i18n/request.ts'
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',

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
