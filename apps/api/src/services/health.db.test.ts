import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "../db/client";
import { testDatabase } from "../test/db";
import { checkDatabase } from "./health";

const { db, pool } = testDatabase();
// Port 1 on loopback refuses connections immediately.
const unreachable = createDatabase("postgres://coursebook:coursebook@127.0.0.1:1/coursebook_test");

afterAll(async () => {
  await Promise.all([pool.end(), unreachable.pool.end()]);
});

describe("database health check", () => {
  it("resolves when the database answers", async () => {
    await expect(checkDatabase(db)).resolves.toBeUndefined();
  });

  it("rejects when the database is unreachable", async () => {
    await expect(checkDatabase(unreachable.db)).rejects.toThrow();
  });
});
