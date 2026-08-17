// Playwright reads no `.env` of its own, and the specs need the demo passwords and `INTERNAL_API_SECRET`
// that live there — without them the suite dies at import time, before a browser ever opens. Loading it
// here covers the whole run: workers and the `webServer` process are started from this one and inherit its
// environment. Already-set variables still win, so `DEMO_OWNER_PASSWORD=… pnpm test:e2e` keeps working.
import "dotenv/config";

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  // The first test in the suite touches several routes Next dev hasn't
  // compiled yet; each JIT compile adds up across a multi-step test and can
  // exceed the 30s default well before any single assertion times out.
  timeout: 60_000,
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
