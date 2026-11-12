import { defineConfig, devices } from "@playwright/test";

const PORT = 3120;

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  workers: 1, // tests share one server; keeps any live-DB tests well under the rate limits
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Tests run against the production build, which is what ships.
  webServer: {
    command: `npm run build && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 240_000,
  },
});
