import { defineConfig, devices } from "@playwright/test";

// E2E always runs against mock mode: no API keys, no network, no cost.
const apiPort = 3101;
const webPort = 5273;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${webPort}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      IDEA_CHECKER_MOCK: "1",
      IDEA_CHECKER_PORT: String(apiPort),
      IDEA_CHECKER_WEB_PORT: String(webPort),
      IDEA_CHECKER_DATA_DIR: "test-results/e2e-data",
    },
  },
});
