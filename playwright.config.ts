import { defineConfig, devices } from "@playwright/test";

const port = 3188;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
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
    // LA-1935: keep the browser test server off the live Jev API whatever the shell exports.
    env: { KULKA_BROWSER_TEST: "1", TYPESAFE_API_KEY: "" },
    port,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
