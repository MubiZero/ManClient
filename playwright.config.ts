import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: "pnpm db:seed && pnpm dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    trace: "retain-on-failure",
  },
  expect: {
    // Next.js dev mode compiles routes on first request; the very first
    // navigation in the suite can take longer than the 5s default while
    // it JIT-compiles, especially as the app grows. Give assertions room.
    timeout: 15_000,
  },
  projects: [
    {
      name: "chromium",
      use: devices["Desktop Chrome"],
    },
  ],
});
