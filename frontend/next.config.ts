import type { NextConfig } from "next";

// Without it a deployed web app would forward /api to its own localhost, so stop the build.
if (process.env.VERCEL && !process.env.API_BASE_URL) {
  throw new Error("Set API_BASE_URL (the Django API's URL) in the Vercel project settings.");
}

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
