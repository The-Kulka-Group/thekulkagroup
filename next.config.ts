import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@kulka/engine"],
  // The browser-test database loads local WASM assets through Node's URL API.
  // Bundling it replaces those URLs and prevents the test database from opening.
  serverExternalPackages: ["@electric-sql/pglite"],

  // Pin the workspace root. Next infers it by walking up for a lockfile, so
  // any lockfile above the repo wins over ours.
  turbopack: { root: import.meta.dirname },

  // Nothing here excludes reference/. The static design shells in it are never
  // imported, so the build never reaches them.
};

export default nextConfig;
