import { afterAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL } from "../test/db";
import { createDatabase, REQUEST_POOL_TIMEOUTS } from "./client";

const server = createDatabase(TEST_DATABASE_URL, REQUEST_POOL_TIMEOUTS);
const unlimited = createDatabase(TEST_DATABASE_URL);
const short = createDatabase(TEST_DATABASE_URL, { ...REQUEST_POOL_TIMEOUTS, statement_timeout: 50 });

afterAll(async () => {
  await Promise.all([server.pool.end(), unlimited.pool.end(), short.pool.end()]);
});

const statementTimeout = async (pool: typeof server.pool) =>
  (await pool.query<{ statement_timeout: string }>("show statement_timeout")).rows[0]?.statement_timeout;

describe("database pools", () => {
  it("gives the API server's pool its connection and statement timeouts", async () => {
    expect(await statementTimeout(server.pool)).toBe("10s");
    expect(server.pool.options.connectionTimeoutMillis).toBe(5_000);
  });

  it("leaves pools created without timeouts (importer, seed script, tests) unlimited", async () => {
    expect(await statementTimeout(unlimited.pool)).toBe("0");
    expect(unlimited.pool.options.connectionTimeoutMillis ?? 0).toBe(0);
  });

  it("cancels a statement that runs past the timeout", async () => {
    await expect(short.pool.query("select pg_sleep(1)")).rejects.toMatchObject({ code: "57014" });
  });
});
