
/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow access from your local network IP during development
  allowedDevOrigins: ['192.168.1.42','192.168.1.5'],

  images: {
    
    localPatterns: [
    { pathname: '/api/magazine-assets' },
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
