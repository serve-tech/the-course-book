import { courseSchema, RegionFilter } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { ListTab } from "../top-lists/lists";
import { mostPlayed, nationalProgress, placeBreakdown, placeCounts, stateView, type RankedPlay } from "./stats";

const row = (id: string, played: number, place: Record<string, unknown>): RankedPlay => ({
  course: courseSchema.parse({ id, name: "Course " + id, location: "", ...place }),
  played,
});

/** A ranking in rank order: two states tie on one course each after Michigan. */
const rows = [
  row("sand", 1, { country: "USA", state: "NE", location: "Mullen, NE, USA", usa: 8 }),
  row("arc", 5, { country: "USA", state: "MI", location: "Arcadia, MI, USA", public: 16 }),
  row("kings", 2, { country: "USA", state: "MI", location: "Kingsley, MI, USA" }),
  row("old", 5, { country: "Scotland", location: "St Andrews, Scotland", world: 3, global: 3 }),
  row("hague", 1, { country: "Netherlands", location: "The Hague, Netherlands", world: 1 }),
  row("pine", 0, { country: "USA", state: "NJ", location: "Pine Valley, NJ, USA", usa: 1, global: 1 }),
];

describe("nationalProgress", () => {
  it("counts national Top 100 courses from published ranks, naming each list's tab", () => {
    expect(nationalProgress(rows)).toEqual([
      { list: ListTab.World, title: "World Top 100", played: 2, size: 100 },
      { list: ListTab.USA, title: "USA Top 100", played: 2, size: 100 },
      { list: ListTab.Public, title: "USA Public Top 100", played: 1, size: 100 },
      { list: ListTab.International, title: "International Top 100", played: 2, size: 100 },
    ]);
  });

  it("reads zero on every list for an empty ranking", () => {
    expect(nationalProgress([]).map((list) => list.played)).toEqual([0, 0, 0, 0]);
  });
});

describe("placeBreakdown", () => {
  it("lists states and countries most courses first, ties in rank order", () => {
    expect(placeBreakdown(rows)).toEqual({
      states: [
        { key: "MI", name: "Michigan", courses: 2 },
        { key: "NE", name: "Nebraska", courses: 1 },
        { key: "NJ", name: "New Jersey", courses: 1 },
      ],
      countries: [
        { key: "USA", name: "USA", courses: 4 },
        { key: "SCOTLAND", name: "Scotland", courses: 1 },
        { key: "NETHERLANDS", name: "Netherlands", courses: 1 },
      ],
    });
  });

  it.each([
    ["no courses", [], { states: [], countries: [] }],
    [
      "a U.S. course without a state counts for the country only",
      [row("x", 0, { country: "USA" })],
      { states: [], countries: [{ key: "USA", name: "USA", courses: 1 }] },
    ],
    ["a course without a country counts nowhere", [row("x", 0, { state: "MI" })], { states: [], countries: [] }],
    [
      "a state outside the USA is not a U.S. state",
      [row("x", 0, { country: "Canada", state: "ON" })],
      { states: [], countries: [{ key: "CANADA", name: "Canada", courses: 1 }] },
    ],
    [
      "countries match whatever their case, keeping the first spelling",
      [row("a", 0, { country: "Scotland" }), row("b", 0, { country: " SCOTLAND " })],
      { states: [], countries: [{ key: "SCOTLAND", name: "Scotland", courses: 2 }] },
    ],
    [
      "UK reads as United Kingdom",
      [row("a", 0, { country: "UK" }), row("b", 0, { country: "United Kingdom" })],
      { states: [], countries: [{ key: "UNITED KINGDOM", name: "United Kingdom", courses: 2 }] },
    ],
    [
      "an unknown state code shows as written",
      [row("a", 0, { country: "USA", state: "zz" })],
      { states: [{ key: "ZZ", name: "ZZ", courses: 1 }], countries: [{ key: "USA", name: "USA", courses: 1 }] },
    ],
  ] as const)("%s", (_case, input, expected) => {
    expect(placeBreakdown(input)).toEqual(expected);
  });
});

describe("placeCounts", () => {
  it("counts places from courses alone, with the top state's code for a default view", () => {
    const courses = rows.map(({ course }) => ({ course }));
    expect(placeCounts(courses)).toEqual({ states: 3, countries: 3, topState: "Michigan", topStateCode: "MI" });
  });

  it("gives a tie for most courses to the state with the higher-ranked course", () => {
    expect(placeCounts(rows.filter(({ course }) => course.state !== "MI"))).toMatchObject({ topState: "Nebraska", topStateCode: "NE" });
  });

  it("has nothing to say about an empty ranking", () => {
    expect(placeCounts([])).toEqual({ states: 0, countries: 0, topState: null, topStateCode: null });
  });
});

describe("stateView", () => {
  it.each([
    ["a state with courses", "MI", { region: RegionFilter.State, state: "MI", top: null }],
    ["a state the member has not played", "CA", null],
    ["a code that names no state", "ZZ", null],
  ] as const)("%s", (_case, code, expected) => {
    expect(stateView(rows, code)).toEqual(expected);
  });
});

describe("mostPlayed", () => {
  it.each([
    ["the course with the most rounds, ties to the higher rank", rows, "arc"],
    ["nothing when no course has a second round", [row("a", 1, {}), row("b", 0, {})], null],
    ["nothing for a member with no rounds", [row("a", 0, {})], null],
    ["nothing for an empty ranking", [], null],
  ] as const)("%s", (_case, input, expected) => {
    expect(mostPlayed(input)?.course.id ?? null).toBe(expected);
  });
});
