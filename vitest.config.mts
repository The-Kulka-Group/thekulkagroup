import { defineConfig } from "vitest/config";

// One test run at the repo root covers every workspace package. The app has no
// tests yet; when it gets them, add its glob here.
export default defineConfig({
  test: {
    include: ["packages/*/**/*.test.{ts,tsx}"],
  },
});
