import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";
const STUB = "http://127.0.0.1:3999";
const APP = "http://127.0.0.1:3000";
const API = "http://127.0.0.1:3001";

/** A configured value, or undefined when it is the .env.example placeholder. */
const real = (value: string | undefined) =>
  value && !value.includes("replace_me") ? value : undefined;

const clerkKeys = {
  CLERK_PUBLISHABLE_KEY:
    real(process.env["CLERK_PUBLISHABLE_KEY"]) ??
    "pk_test_" + Buffer.from("example.clerk.accounts.dev$").toString("base64"),
  CLERK_SECRET_KEY: real(process.env["CLERK_SECRET_KEY"]) ?? "sk_test_" + "0".repeat(48),
};

/**
 * Browser tests run against the production builds: the API bundle bound to
 * the test database, with course discovery pointed at a local OpenGolfAPI
 * stub, and the static web app pointed at that API. The `setup` project migrates the database and
 * prepares Clerk before the browser projects run.
 */
export default defineConfig({
  testDir: ".",
  // Every signed-in scenario, in both browser projects, resets and mutates
  // the same two Clerk test users' rows (db.ts). Parallel workers
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
      command: "pnpm exec tsx opengolf-stub.ts",
      url: STUB + "/healthz",
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: "pnpm --filter @coursebook/api build && pnpm --filter @coursebook/api start",
      url: API + "/healthz",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: {
        PORT: "3001",
        NODE_ENV: "production",
        DATABASE_URL: TEST_DATABASE_URL,
        WEB_ORIGINS: APP,
        OPENGOLF_API_URL: STUB + "/v1/courses/search",
        OPENGOLF_CSV_URL: STUB + "/opengolfapi-us.csv",
        ...clerkKeys,
      },
    },
    {
      // The static build served like the Render static site (static-server.ts).
      command: "pnpm --filter @coursebook/web build && pnpm exec tsx static-server.ts",
      url: APP + "/",
      reuseExistingServer: !process.env["CI"],
      timeout: 120_000,
      env: {
        PORT: "3000",
        VITE_API_URL: API,
        VITE_CLERK_PUBLISHABLE_KEY: clerkKeys.CLERK_PUBLISHABLE_KEY,
      },
    },
  ],
});
