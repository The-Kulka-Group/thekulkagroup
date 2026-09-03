import { defineConfig, devices } from "@playwright/test";

const port = 3188;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  outputDir: "/tmp/kulka-playwright-results",
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{
    name: "chromium",
    use: { ...devices["Desktop Chrome"] },
  }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    env: { KULKA_BROWSER_TEST: "1" },
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
