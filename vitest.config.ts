import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";

/**
 * Web projects, plus the workspace packages' own configurations:
 * - node: web modules without a database.
 * - jsdom: component tests.
 * - db: web route suites (`*.db.test.ts`) against the migrated local test
 *   database, run serially.
 * - domain, api-node, api-db: see packages/domain and apps/api.
 * `pnpm test:unit` skips the database projects.
 */
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["app/**/*.test.ts"],
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
          globalSetup: ["apps/api/src/test/global-setup.ts"],
          fileParallelism: false,
          // Route modules use the process-wide database handle, so point it
          // at the test database for this project.
          env: { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_TEST: TEST_DATABASE_URL },
        },
      },
      "packages/domain/vitest.config.ts",
      "apps/api/vitest.config.ts",
    ],
  },
});
