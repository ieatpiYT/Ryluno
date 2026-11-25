import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // OAuth callback URLs contain one-time codes; never log request URLs.
  logging: false,
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
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
