import { describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, testDatabase } from "../test/db";
import { runMigrations } from "./migrate";

describe("runMigrations", () => {
  it("lets concurrent starts run without conflict", async () => {
    await expect(Promise.all([runMigrations(TEST_DATABASE_URL), runMigrations(TEST_DATABASE_URL)])).resolves.toEqual([
      undefined,
      undefined,
    ]);
    const { pool } = testDatabase();
    try {
      const { rows } = await pool.query<{ count: string }>("select count(*) from drizzle.__drizzle_migrations");
      expect(Number(rows[0]?.count)).toBe(3);
    } finally {
      await pool.end();
    }
  });
});
