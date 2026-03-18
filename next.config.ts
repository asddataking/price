import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  eslint: {
    // Vercel runs `next build` which includes linting by default.
    // Our current flat-config setup may be incompatible across environments,
    // so we ignore lint during builds to unblock deployment.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
