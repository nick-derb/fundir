import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['*'],
    },
  },
  // Homepage is the Claude Design landing, served as a self-contained static
  // export (public/landing/index.html, built by scripts/build-landing.mjs).
  // beforeFiles wins over the app router, so "/" renders the design directly.
  // Homepage + the request-access page are the Claude Design pages, served as
  // self-contained static exports (public/landing, public/request-access, built
  // by scripts/build-*.mjs). beforeFiles wins over the app router.
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/landing/index.html' },
        { source: '/onboarding', destination: '/request-access/index.html' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
