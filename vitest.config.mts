import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// One test run at the repo root covers both seams LA-9 names: the engine
// package (pure, no network) and the site's API routes against an in-process
// Postgres built from supabase/migrations.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    // Each database-backed file starts an in-process Postgres instance. Run
    // files one at a time so concurrent startup cannot exhaust the test host.
    fileParallelism: false,
    // LA-1935: a shell that exports the key would make the ROM criteria call the live Jev API.
    // Tests inject a fake client where they need one, so no test reads the real key.
    env: { TYPESAFE_API_KEY: "" },
    include: [
      "packages/*/**/*.test.{ts,tsx}",
      "{app,lib,test}/**/*.test.{ts,tsx}",
    ],
  },
});
