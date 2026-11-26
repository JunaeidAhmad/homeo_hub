import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false, // no floating "N" badge in development
  cacheComponents: true,
  partialPrefetching: true,
  // /api/... is forwarded to Django, which needs its trailing slash (see src/proxy.ts).
  skipTrailingSlashRedirect: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
