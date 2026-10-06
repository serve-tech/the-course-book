import { afterAll, describe, expect, it } from "vitest";
import { withJournalLock } from "../services/journal";
import { expectDbError, TEST_DATABASE_URL } from "../test/db";
import { createDatabase, REQUEST_POOL_TIMEOUTS } from "./client";

const server = createDatabase(TEST_DATABASE_URL, REQUEST_POOL_TIMEOUTS);
const unlimited = createDatabase(TEST_DATABASE_URL);
const short = createDatabase(TEST_DATABASE_URL, { ...REQUEST_POOL_TIMEOUTS, statement_timeout: 50 });

afterAll(async () => {
  await Promise.all([server.pool.end(), unlimited.pool.end(), short.pool.end()]);
});

/** The pool's statement timeout in milliseconds, as Postgres applies it. */
const statementTimeout = async (pool: typeof server.pool) =>
  (await pool.query<{ ms: number }>("select (extract(epoch from current_setting('statement_timeout')::interval) * 1000)::int as ms")).rows[0]?.ms;

describe("database pools", () => {
  it("gives the API server's pool its connection and statement timeouts", async () => {
    expect(await statementTimeout(server.pool)).toBe(REQUEST_POOL_TIMEOUTS.statement_timeout);
    expect(server.pool.options.connectionTimeoutMillis).toBe(REQUEST_POOL_TIMEOUTS.connectionTimeoutMillis);
  });

  it("leaves pools created without timeouts (importer, seed script, tests) unlimited", async () => {
    expect(await statementTimeout(unlimited.pool)).toBe(0);
    expect(unlimited.pool.options.connectionTimeoutMillis ?? 0).toBe(0);
  });

  it("cancels a statement that runs past the timeout", async () => {
    await expect(short.pool.query("select pg_sleep(1)")).rejects.toMatchObject({ code: "57014" });
  });

  it("reads a short timeout in milliseconds", async () => {
    expect(await statementTimeout(short.pool)).toBe(50);
  });

  it("cancels a wait for a member lock that outlasts the timeout", async () => {
    const holder = await unlimited.pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock(hashtext($1)::bigint)", ["user_locked"]);
      await expectDbError(
        withJournalLock(short.db, "user_locked", () => Promise.resolve()),
        /canceling statement due to statement timeout/,
      );
    } finally {
      try {
        await holder.query("rollback");
      } finally {
        holder.release();
      }
    }
    // Once the lock is free the same pool takes it, so the wait, not the statements around it, timed out.
    await expect(withJournalLock(short.db, "user_locked", () => Promise.resolve("locked"))).resolves.toBe("locked");
  });
});
