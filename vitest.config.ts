import { defineConfig } from "vitest/config";

/**
 * Every workspace package defines its own projects; `pnpm test` runs them
 * all. Database projects share the local test database and run in separate
 * sequence groups (`sequence.groupOrder`), never at the same time.
 */
export default defineConfig({
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/*/vitest.config.ts"],
  },
});
