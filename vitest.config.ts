import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";

/**
 * Three projects:
 * - node: pure and server modules, no database.
 * - jsdom: component tests.
 * - db: `*.db.test.ts` suites against the migrated local test database,
 *   run serially. `pnpm test:unit` skips this project when no database is
 *   available.
 */
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["app/**/*.test.ts", "scripts/**/*.test.ts", "packages/*/src/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["app/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "db",
          environment: "node",
          include: ["app/**/*.db.test.ts"],
          globalSetup: ["app/test/global-setup.ts"],
          fileParallelism: false,
          // Route modules use the process-wide database handle, so point it
          // at the test database for this project.
          env: { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_TEST: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
