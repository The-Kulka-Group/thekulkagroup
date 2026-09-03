import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@kulka/engine"],

  // Pin the workspace root. Next infers it by walking up for a lockfile, so
  // any lockfile above the repo wins over ours.
  turbopack: { root: import.meta.dirname },

  async headers() {
    const authHeaders = [
      { key: "Cache-Control", value: "private, no-store" },
      { key: "CDN-Cache-Control", value: "no-store" },
      { key: "Vercel-CDN-Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ];
    return ["/login", "/forgot-password", "/auth/continue", "/update-password"].map((source) => ({
      source,
      headers: authHeaders,
    }));
  },

  // Nothing here excludes reference/. The static design shells in it are never
  // imported, so the build never reaches them.
};

export default nextConfig;
