import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@pakka/verifier", "@pakka/contracts"],
  serverExternalPackages: ["mailauth"],
  poweredByHeader: false,
  webpack(config) {
    // The workspace packages use ESM-style ".js" imports that point at ".ts" sources.
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
