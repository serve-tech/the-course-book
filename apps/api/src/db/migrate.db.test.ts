import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, testDatabase } from "../test/db";
import { runMigrations } from "./migrate";

/** Migrations drizzle-kit has generated, from its journal: the reference, not a fixed count. */
const journal = JSON.parse(readFileSync(new URL("./migrations/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: unknown[];
};

describe("runMigrations", () => {
  it("lets concurrent starts run without conflict and applies every migration once", async () => {
    await expect(Promise.all([runMigrations(TEST_DATABASE_URL), runMigrations(TEST_DATABASE_URL)])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    const { pool } = testDatabase();
    try {
      const { rows } = await pool.query<{ count: string }>("select count(*) from drizzle.__drizzle_migrations");
      expect(Number(rows[0]?.count)).toBe(journal.entries.length);
    } finally {
      await pool.end();
    }
  });
});
