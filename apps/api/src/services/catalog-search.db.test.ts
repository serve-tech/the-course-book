import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { normalizeName } from "@coursebook/domain/catalog/course";
import { and, eq } from "drizzle-orm";
import { courseRankings, courses } from "../db/schema";
import { resetMemberData, testDatabase } from "../test/db";
import { searchCatalogCourses } from "./catalog-search";

const { db, pool } = testDatabase();
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await resetMemberData(db); });

const insert = (names: string[]) => db.insert(courses).values(names.map((name) => ({
  name, nameKey: normalizeName(name), city: "Rochester", state: "MI", country: "USA", isCustom: true,
}))).returning();

describe("stored course search", () => {
  it("finds Katke-Cousins by Oakland and by separate name terms with its existing id and ranks", async () => {
    const [ranking] = await db.select({ rank: courseRankings.rank }).from(courseRankings).where(and(
      eq(courseRankings.courseId, "6f977d77-3e2d-4dbd-818e-cd8687de35cd"), eq(courseRankings.rankingType, "state"),
    ));
    expect(ranking).toBeDefined();
    for (const query of ["Oakland", "  KATKE  cousins  "]) {
      const result = await searchCatalogCourses(db, query, 1);
      const katke = result.results.find((hit) => hit.catalogId === "6f977d77-3e2d-4dbd-818e-cd8687de35cd");
      expect(katke?.course).toMatchObject({ name: "Oakland University: Katke-Cousins", michigan: ranking?.rank });
    }
  });

  it("pages all shared custom courses alphabetically and sees newly stored rows immediately", async () => {
    const names = Array.from({ length: 23 }, (_, i) => `Pagination Fixture ${String(i + 1).padStart(2, "0")}`);
    await insert([...names].reverse());
    const first = await searchCatalogCourses(db, "Pagination Fixture", 1);
    const second = await searchCatalogCourses(db, "Pagination Fixture", 2);
    const third = await searchCatalogCourses(db, "Pagination Fixture", 3);
    expect(first.results).toHaveLength(10);
    expect(second.results).toHaveLength(10);
    expect(third.results).toHaveLength(3);
    expect([...first.results, ...second.results, ...third.results].map((hit) => hit.course.name)).toEqual(names);
    expect(third).toMatchObject({ page: 3, pageSize: 10, total: 23 });
    expect(first.results.every((hit) => hit.catalogId === hit.course.id)).toBe(true);
    expect(await searchCatalogCourses(db, "Pagination Fixture", 4)).toEqual({ results: [], page: 4, pageSize: 10, total: 23 });
    await insert(["Pagination Fixture 00"]);
    expect((await searchCatalogCourses(db, "Pagination Fixture", 1)).results[0]?.course.name).toBe("Pagination Fixture 00");
  });

  it("preserves distinct stored rows even when their name and location match", async () => {
    const rows = await insert(["Duplicate Fixture", "Duplicate Fixture"]);
    const result = await searchCatalogCourses(db, "Duplicate Fixture", 1);
    expect(result.total).toBe(2);
    expect(result.results.map((hit) => hit.catalogId)).toEqual(rows.map((row) => row.id).sort());
  });

  it.each(["%", "_", "\\"])("treats %s literally, not as a SQL wildcard", async (character) => {
    const name = `Literal ${character} Fixture`;
    await insert([name, "Literal Other Fixture"]);
    expect((await searchCatalogCourses(db, `Literal ${character}`, 1)).results.map((hit) => hit.course.name)).toEqual([name]);
  });

  it("returns empty metadata for no matches", async () => {
    expect(await searchCatalogCourses(db, "NeverExistingSearchFixture", 1)).toEqual({ results: [], page: 1, pageSize: 10, total: 0 });
  });
});
