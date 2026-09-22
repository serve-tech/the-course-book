import { defineConfig } from "vitest/config";

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
          include: ["app/**/*.test.ts", "scripts/**/*.test.ts"],
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
        },
      },
    ],
  },
});
