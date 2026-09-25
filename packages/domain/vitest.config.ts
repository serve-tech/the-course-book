import { defineConfig } from "vitest/config";

/** Pure rules only: no database, no DOM. Paths resolve from this directory. */
export default defineConfig({
  test: {
    name: "domain",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
