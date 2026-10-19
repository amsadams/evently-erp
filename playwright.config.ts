import { defineConfig, devices } from "@playwright/test";

const external = process.env.BASE_URL;
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: external ?? "http://localhost:3100", trace: "retain-on-failure", viewport: { width: 1366, height: 860 } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: external ? undefined : { command: "npm run build && npm run start -- -p 3100", url: "http://localhost:3100", reuseExistingServer: true, timeout: 300_000 },
});
