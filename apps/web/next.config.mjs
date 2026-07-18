/** @type {import('next').NextConfig} */
// Frontend proxies /api/* to the backend. In dev this is localhost:8000;
// in production (Vercel), set NEXT_PUBLIC_API_BASE_URL to your Fly.io
// backend URL — e.g. https://echostand-api.fly.dev — and Vercel will
// substitute it at build time.
const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
