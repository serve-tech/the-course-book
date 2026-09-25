import { existsSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

if (existsSync(".env")) process.loadEnvFile(".env");

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";
const STUB = "http://127.0.0.1:3999";
const APP = "http://127.0.0.1:3000";

/** A configured value, or undefined when it is the .env.example placeholder. */
const real = (value: string | undefined) =>
  value && !value.includes("replace_me") ? value : undefined;

/**
 * Browser tests run against the production server bundle bound to the test
 * database, with course discovery pointed at a local OpenGolfAPI stub. The
 * `setup` project migrates the database and prepares Clerk before the
 * browser projects run.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  // Every signed-in scenario, in both browser projects, resets and mutates
  // the same two Clerk test users' rows (tests/e2e/db.ts). Parallel workers
  // collide on those rows, so the suite runs one test at a time.
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  use: {
    baseURL: APP + "/",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /global\.setup\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, dependencies: ["setup"], testIgnore: /global\.setup\.ts/ },
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], defaultBrowserType: "chromium" },
      dependencies: ["setup"],
      testIgnore: /global\.setup\.ts/,
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/e2e/opengolf-stub.ts",
      url: STUB + "/healthz",
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: "pnpm build && pnpm start",
      url: APP + "/healthz",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: {
        PORT: "3000",
        NODE_ENV: "production",
        DATABASE_URL: TEST_DATABASE_URL,
        OPENGOLF_API_URL: STUB + "/v1/courses/search",
        OPENGOLF_CSV_URL: STUB + "/opengolfapi-us.csv",
        CLERK_PUBLISHABLE_KEY:
          real(process.env["CLERK_PUBLISHABLE_KEY"]) ??
          "pk_test_" + Buffer.from("example.clerk.accounts.dev$").toString("base64"),
        CLERK_SECRET_KEY: real(process.env["CLERK_SECRET_KEY"]) ?? "sk_test_" + "0".repeat(48),
      },
    },
  ],
});
