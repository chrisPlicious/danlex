import { existsSync } from "node:fs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  env: {
    // resolved at build time: public/ is served by the CDN, not readable from functions
    NEXT_PUBLIC_HAS_LOGO: existsSync("public/brand/danlex-logo.png") ? "1" : "",
  },
  experimental: {
    // admin QR uploads go through a server action; payment proofs use signed URLs instead
    serverActions: { bodySizeLimit: "4mb" },
  },
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
