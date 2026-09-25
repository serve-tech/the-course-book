import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { courses, users } from "../db/schema";
import { RankingFilter } from "@coursebook/domain/catalog/course";
import { selectRankings } from "@coursebook/domain/catalog/ranking-selectors";
import { resetMemberData, testDatabase } from "../test/db";
import {
  catalog,
  findOrCreateCourse,
  invalidateCatalog,
  requireCourse,
} from "./catalog";
import { ErrorCode } from "./errors";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  invalidateCatalog();
});

const stable = async (stableId: string) => {
  const [row] = await db.select().from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row;
};

describe("catalog snapshot", () => {
  it("loads every course and complete published lists", async () => {
    const snapshot = await catalog(db);
    expect(snapshot.courses.length).toBeGreaterThanOrEqual(1414);
    expect(snapshot.rankings).toHaveLength(1430);
    const world = selectRankings(snapshot.rankings, RankingFilter.World, "", "", false, {});
    expect(world.complete).toBe(true);
    expect(world.total).toBe(100);
    const michigan = selectRankings(snapshot.rankings, RankingFilter.State, "MI", "", false, {});
    expect(michigan.complete).toBe(true);
    expect(michigan.total).toBe(100);
  });

  it("carries rank fields on course views", async () => {
    const snapshot = await catalog(db);
    const arcadia = snapshot.byId.get((await stable("michigan11")).id);
    expect(arcadia?.michigan).toBeGreaterThan(0);
  });
});

describe("find or create course", () => {
  it("returns an existing course for its id and rejects unknown ids", async () => {
    const row = await stable("usa1");
    await expect(
      db.transaction((tx) => findOrCreateCourse(tx, { courseId: row.id }, null)),
    ).resolves.toEqual({ id: row.id, created: false });
    await expect(
      requireCourse(db, "00000000-0000-4000-8000-000000000000"),
    ).rejects.toMatchObject({ status: 404, code: ErrorCode.CourseNotFound });
  });

  it("resolves aliases to the bundled course", async () => {
    const expected = await stable("michigan11");
    const { id, created } = await db.transaction((tx) =>
      findOrCreateCourse(tx, { name: "Arcadia Bluffs Golf Club", location: "", city: "", state: "", country: "", logo: "", website: "", isCustom: false }, null),
    );
    expect(id).toBe(expected.id);
    expect(created).toBe(false);
  });

  it("matches a same-name course only at the same location", async () => {
    const before = (await db.select().from(courses)).length;
    const { id: existing, created: matchedCreated } = await db.transaction((tx) =>
      findOrCreateCourse(tx, { name: "Friar's Head", location: "Riverhead, NY, USA", city: "Riverhead", state: "NY", country: "USA", logo: "", website: "", isCustom: false }, null),
    );
    const [row] = await db.select().from(courses).where(eq(courses.id, existing));
    expect(row?.city).toBe("Riverhead");
    expect((await db.select().from(courses)).length).toBe(before);
    expect(matchedCreated).toBe(false);

    const { id: elsewhere, created: insertedCreated } = await db.transaction((tx) =>
      findOrCreateCourse(tx, { name: "Friar's Head", location: "Austin, TX, USA", city: "Austin", state: "TX", country: "USA", logo: "", website: "", isCustom: true }, null),
    );
    expect(elsewhere).not.toBe(existing);
    expect(insertedCreated).toBe(true);
    expect((await db.select().from(courses)).length).toBe(before + 1);
  });

  it("records the creator and custom flag and derives state from the location", async () => {
    await db.insert(users).values({ id: "user_c", username: "creator", displayName: "Creator" });
    const { id } = await db.transaction((tx) =>
      findOrCreateCourse(tx, { name: "Backyard Nine", location: "Hometown, OH", city: "", state: "", country: "", logo: "", website: "", isCustom: true }, "user_c"),
    );
    const [row] = await db.select().from(courses).where(eq(courses.id, id));
    expect(row).toMatchObject({ isCustom: true, createdBy: "user_c", state: "OH", city: "Hometown", country: "USA", nameKey: "backyard nine" });
    invalidateCatalog();
    expect((await catalog(db)).byId.has(id)).toBe(true);
  });

  it("applies canonical Scottish geography before matching", async () => {
    const { id: first } = await db.transaction((tx) =>
      findOrCreateCourse(tx, { name: "Balcomie Links", location: "USA", city: "", state: "", country: "USA", logo: "", website: "", isCustom: false }, null),
    );
    const [row] = await db.select().from(courses).where(eq(courses.id, first));
    expect(row?.country).not.toBe("USA");
    expect(row?.city).toBe("Anstruther");
  });
});
