import type { NextConfig } from "next";

// The static design shells live in reference/ and are not part of the build.
const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them itself.
  transpilePackages: ["@kulka/engine"],

  // Pin the workspace root. Without it Next walks up and finds the stray
  // package-lock.json in the home directory.
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
