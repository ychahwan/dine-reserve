import { defineConfig } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e/report", open: "never" }],
  ],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },

  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "setup",
      testMatch: /global\.setup\.ts/,
      timeout: 180_000,
    },
    {
      name: "landing",
      testMatch: /landing\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "auth",
      testMatch: /auth\.spec\.ts/,
      dependencies: ["setup"],
    },
    {
      name: "customer",
      testMatch: /customer\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/customer.json" },
    },
    {
      name: "owner",
      testMatch: /owner\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/owner.json" },
    },
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      dependencies: ["setup"],
      use: { storageState: "e2e/.auth/admin.json" },
    },
    {
      name: "account-switching",
      testMatch: /account-switching\.spec\.ts/,
      // No dependencies — tests the full login flow fresh
    },
    {
      name: "auth-extended",
      testMatch: /auth-extended\.spec\.ts/,
      dependencies: ["setup"],
      // Use the OTP user storage state for scenarios that start signed in.
      use: { storageState: "e2e/.auth/otp.json" },
    },
  ],
});
