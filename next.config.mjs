
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow access from your local network IP during development
  allowedDevOrigins: ['192.168.1.42','192.168.1.5'],

  experimental: {
    // Article text parsed from a large PDF is saved through a server action
    // (up to 1,000,000 characters); the 1 MB default is too small for that.
    serverActions: { bodySizeLimit: '5mb' },
  },

  images: {
    
    localPatterns: [
    { pathname: '/api/magazine-assets' },
    { pathname: '/api/blog-assets' },
    { pathname: '/tvv-logo.png' },
    { pathname: '/edition-*.png' },
    { pathname: '/cover-*.png' },
  ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
