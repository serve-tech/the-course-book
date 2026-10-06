import { describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import { pageSearchResults, resolveSearchResults } from "./course-search";

const course = (id: string, name: string, city = "Rochester") =>
  courseSchema.parse({ id, name, city, location: `${city}, MI, USA`, state: "MI", country: "USA" });

describe("course search ordering and pagination", () => {
  it("orders all names alphabetically, breaking ties by location and id", () => {
    const input = [course("z", "Zulu"), course("b", "alpha", "Troy"), course("d", "Alpha", "Detroit"), course("c", "Alpha", "Detroit")];
    const ordered = resolveSearchResults(input, []);
    expect(ordered.map((hit) => hit.course.id)).toEqual(["c", "d", "b", "z"]);
    expect(resolveSearchResults([...input].reverse(), []).map((hit) => hit.course.id)).toEqual(["c", "d", "b", "z"]);
    expect(input[0]?.name).toBe("Zulu");
  });

  it("deduplicates resolved catalog identities before counting and paging", () => {
    const known = course("11111111-1111-4111-8111-111111111111", "Oakland University: Katke-Cousins");
    const results = resolveSearchResults([course("api-one", known.name), course("api-two", known.name)], [known]);
    expect(pageSearchResults(results, 1)).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(results.map((hit) => hit.catalogId)).toEqual([known.id]);
  });

  it("preserves geography and ambiguous-name checks when indexing the catalog", () => {
    const detroit = course("detroit", "Cherry Creek Golf Club", "Detroit");
    const rochester = course("rochester", "Cherry Creek Golf Course", "Rochester");
    const troy = course("troy", "Cherry Creek", "Troy");
    const catalog = [detroit, rochester, troy];
    expect(resolveSearchResults([course("external", "Cherry Creek", "Rochester")], catalog)[0]?.catalogId).toBe("rochester");
    const noCity = { ...course("external", "Cherry Creek"), city: "" };
    expect(resolveSearchResults([noCity], catalog)[0]?.catalogId).toBeNull();
    expect(resolveSearchResults([course("external", "Cherry Creek", "Rochester")], [...catalog, { ...rochester, id: "duplicate" }])[0]?.catalogId).toBeNull();
    expect(resolveSearchResults([course("external", "Cherry Creek", "Nowhere")], catalog)[0]?.catalogId).toBeNull();
  });

  it("keeps Oakland University reachable after the first ten without overlapping pages", () => {
    const input = Array.from({ length: 12 }, (_, i) => course(`oak-${i}`, `Oakland Course ${i + 1}`));
    input.unshift(course("ou", "Oakland University: Katke-Cousins"));
    const results = resolveSearchResults(input, []);
    const first = pageSearchResults(results, 1);
    const second = pageSearchResults(results, 2);
    expect(first.results).toHaveLength(10);
    expect(second.results.map((hit) => hit.course.name)).toEqual(["Oakland Course 11", "Oakland Course 12", "Oakland University: Katke-Cousins"]);
    expect([...first.results, ...second.results]).toEqual(results);
    expect(second).toMatchObject({ page: 2, pageSize: 10, total: 13 });
  });

  it.each([1, 2, 2147483647])("returns an empty page for no matches (page %s)", (page) => {
    expect(pageSearchResults([], page)).toEqual({ results: [], page, pageSize: 10, total: 0 });
  });

  it("returns an empty page past the end without changing the total", () => {
    expect(pageSearchResults(resolveSearchResults([course("a", "Alpha")], []), 2)).toEqual({ results: [], page: 2, pageSize: 10, total: 1 });
  });
});
