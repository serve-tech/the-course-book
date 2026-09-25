import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";
const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Web projects:
 * - node: web modules without a database.
 * - jsdom: component tests.
 * - db: route suites (`*.db.test.ts`) against the migrated local test
 *   database. They share that database with the API's db project, so the
 *   two run in separate sequence groups rather than at the same time.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          root: here,
          restoreMocks: true,
          environment: "node",
          include: ["app/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "jsdom",
          root: here,
          restoreMocks: true,
          environment: "jsdom",
          include: ["app/**/*.test.tsx"],
        },
      },
      {
        test: {
          name: "db",
          root: here,
          restoreMocks: true,
          environment: "node",
          include: ["app/**/*.db.test.ts"],
          globalSetup: ["../api/src/test/global-setup.ts"],
          fileParallelism: false,
          sequence: { groupOrder: 2 },
          // Route modules use the process-wide database handle, so point it
          // at the test database for this project.
          env: { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_TEST: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
