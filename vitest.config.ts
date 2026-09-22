import { defineConfig } from "vitest/config";

/**
 * Two projects: pure/server modules run under Node; component tests run under
 * jsdom. Database-backed suites (`*.db.test.ts`) join the node project in the
 * schema phase and run serially against the local Postgres.
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
        },
      },
      {
        test: {
          name: "jsdom",
          environment: "jsdom",
          include: ["app/**/*.test.tsx"],
        },
      },
    ],
  },
});
