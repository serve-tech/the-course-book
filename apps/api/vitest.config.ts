import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const TEST_DATABASE_URL =
  process.env["DATABASE_URL_TEST"] ??
  "postgres://coursebook:coursebook@localhost:5433/coursebook_test";

/**
 * API projects:
 * - node: pure modules, services without a database, scripts.
 * - db: `*.db.test.ts` suites against the migrated local test database, run
 *   serially and in their own sequence group because other packages' db
 *   projects share the database.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          root: fileURLToPath(new URL(".", import.meta.url)),
          restoreMocks: true,
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "db",
          root: fileURLToPath(new URL(".", import.meta.url)),
          restoreMocks: true,
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["src/test/global-setup.ts"],
          fileParallelism: false,
          sequence: { groupOrder: 1 },
          env: { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_TEST: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
