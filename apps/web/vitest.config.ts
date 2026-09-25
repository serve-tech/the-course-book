import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = fileURLToPath(new URL(".", import.meta.url));

/**
 * Web projects:
 * - node: web modules without a database.
 * - jsdom: component tests.
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
    ],
  },
});
