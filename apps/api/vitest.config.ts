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
 * - api-node: pure modules, services without a database, scripts.
 * - api-db: `*.db.test.ts` suites against the migrated local test database,
 *   run serially because they share it.
 */
export default defineConfig({
  test: {
    restoreMocks: true,
    projects: [
      {
        test: {
          name: "api-node",
          root: fileURLToPath(new URL(".", import.meta.url)),
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
          exclude: ["**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "api-db",
          root: fileURLToPath(new URL(".", import.meta.url)),
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          globalSetup: ["src/test/global-setup.ts"],
          fileParallelism: false,
          env: { DATABASE_URL: TEST_DATABASE_URL, DATABASE_URL_TEST: TEST_DATABASE_URL },
        },
      },
    ],
  },
});
