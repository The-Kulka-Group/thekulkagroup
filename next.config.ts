import type { NextConfig } from "next";
import { AUTH_ROUTES, AUTH_SECURITY_HEADERS } from "./lib/auth/routes";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@kulka/engine"],
  // The browser-test database loads local WASM assets through Node's URL API.
  // Bundling it replaces those URLs and prevents the test database from opening.
  serverExternalPackages: ["@electric-sql/pglite", "pdfjs-dist"],

  // pdfjs-dist loads its worker at runtime. Include it in both server routes
  // that can collect Suffolk Planning Board PDFs.
  outputFileTracingIncludes: {
    "/api/vision/discovery/cron": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
    "/api/vision/discovery/refresh": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
    ],
  },

  // Pin the workspace root. Next infers it by walking up for a lockfile, so
  // any lockfile above the repo wins over ours.
  turbopack: { root: import.meta.dirname },

  async headers() {
    const authHeaders = Object.entries(AUTH_SECURITY_HEADERS).map(([key, value]) => ({ key, value }));
    return AUTH_ROUTES.map((source) => ({
      source,
      headers: authHeaders,
    }));
  },

  // Nothing here excludes reference/. The static design shells in it are never
  // imported, so the build never reaches them.
};

export default nextConfig;
