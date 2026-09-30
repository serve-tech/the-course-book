import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
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

describe("0005 GOLF World Top 100", () => {
  const statements = readFileSync(new URL("./migrations/0005_golf_world_top_100.sql", import.meta.url), "utf8")
    .split("--> statement-breakpoint")
    .filter((statement) => statement.includes("'ardfin'"));

  it("ranks a course a member already added by hand instead of adding it again", async () => {
    const { db, pool } = testDatabase();
    try {
      await db
        .transaction(async (tx) => {
          // Undo what the migration did for Ardfin, then add it the way a member would have.
          await tx.execute(sql`delete from course_rankings where ranking_type = 'global' and rank = 72`);
          await tx.execute(sql`delete from courses where name_key = 'ardfin'`);
          await tx.execute(sql`insert into courses (name, name_key, city, country, is_custom) values ('Ardfin', 'ardfin', 'Jura', 'Scotland', true)`);
          for (const statement of statements) await tx.execute(sql.raw(statement));
          const { rows } = await tx.execute<{ is_custom: boolean; rank: number | null }>(sql`
            select c.is_custom, r.rank from courses c
            left join course_rankings r on r.course_id = c.id and r.ranking_type = 'global'
            where c.name_key = 'ardfin'
          `);
          expect(rows).toEqual([{ is_custom: true, rank: 72 }]);
          throw new Rollback();
        })
        .catch((error: unknown) => {
          if (!(error instanceof Rollback)) throw error;
        });
    } finally {
      await pool.end();
    }
  });
});

/** Thrown to roll the test's transaction back after its assertions. */
class Rollback extends Error {}
