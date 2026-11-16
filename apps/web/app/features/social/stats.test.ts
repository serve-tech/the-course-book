import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { GemReason, listedPhrase, nationalProgress, placeBreakdown, placeCounts, PLACES_SHOWN, profileStats, shownPlaces, type PublishedEntry } from "./stats";

const row = (id: string, _played: number, place: Record<string, unknown>) => ({
  course: courseSchema.parse({ id, name: "Course " + id, location: "", ...place }),
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
  it("counts national Top 100 courses from published ranks", () => {
    expect(nationalProgress(rows)).toEqual([
      { title: "World Top 100", played: 2, size: 100 },
      { title: "USA Top 100", played: 2, size: 100 },
      { title: "USA Public Top 100", played: 1, size: 100 },
      { title: "International Top 100", played: 2, size: 100 },
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

/** A course on a member's ranking, at `rank`, in a U.S. state or another country. */
const ranked = (id: string, rank: number, place: { state?: string; country?: string }) => ({
  course: courseSchema.parse({ id, name: "Course " + id, location: "", country: place.country ?? "USA", state: place.state ?? "" }),
  rank,
});

const entry = (type: string, scope: string, courseId: string, rank: number): PublishedEntry => ({ type, scope, courseId, rank });

/**
 * Six courses in rank order. Bandon ("bt") is on three national lists, lower
 * on each than its owner has it. Franklin Hills ("fh") is only on its state's
 * list. The local course ("loc") is on none.
 */
const ranking = [
  ranked("bt", 1, { state: "OR" }),
  ranked("oh", 2, { state: "MI" }),
  ranked("fh", 3, { state: "MI" }),
  ranked("p2", 4, { state: "NC" }),
  ranked("old", 5, { country: "Scotland" }),
  ranked("loc", 6, { state: "MI" }),
];

const published: PublishedEntry[] = [
  entry("usa", "USA", "pv", 1),
  entry("usa", "USA", "oh", 20),
  entry("usa", "USA", "p2", 32),
  entry("usa", "USA", "bt", 61),
  entry("global", "GLOBAL", "old", 3),
  entry("global", "GLOBAL", "p2", 20),
  entry("global", "GLOBAL", "bt", 76),
  entry("usa_public", "USA_PUBLIC", "p2", 6),
  entry("usa_public", "USA_PUBLIC", "bt", 11),
  entry("world", "WORLD", "old", 1),
  entry("state", "MI", "cd", 1),
  entry("state", "MI", "oh", 2),
  entry("state", "MI", "fh", 16),
  entry("state", "OR", "bt", 3),
  entry("state", "NC", "p2", 2),
  entry("state", "FL", "fl1", 1),
];

const ref = (id: string, rank: number) => ({ id, name: "Course " + id, rank });

describe("profileStats", () => {
  const stats = profileStats(ranking, published);

  it("counts the courses", () => {
    expect(stats.courses).toBe(6);
  });

  it("gives every national list its progress and the member's top-ranked course on it", () => {
    expect(stats.national).toEqual([
      { slug: "world", title: "World Top 100", played: 3, size: 3, top: ref("bt", 1) },
      { slug: "usa", title: "USA Top 100", played: 3, size: 4, top: ref("bt", 1) },
      { slug: "usa-public", title: "USA Public Top 100", played: 2, size: 2, top: ref("bt", 1) },
      { slug: "international", title: "International Top 100", played: 1, size: 1, top: ref("old", 5) },
    ]);
  });

  it("joins each state played to its list: courses there, how many the list holds, and the top-ranked of each", () => {
    expect(stats.states).toEqual([
      // Three Michigan courses, two of them on Best in Michigan's three.
      { key: "MI", name: "Michigan", courses: 3, top: ref("oh", 2), list: { slug: "state-mi", title: "Best in Michigan", played: 2, size: 3, top: ref("oh", 2) } },
      { key: "OR", name: "Oregon", courses: 1, top: ref("bt", 1), list: { slug: "state-or", title: "Best in Oregon", played: 1, size: 1, top: ref("bt", 1) } },
      { key: "NC", name: "North Carolina", courses: 1, top: ref("p2", 4), list: { slug: "state-nc", title: "Best in North Carolina", played: 1, size: 1, top: ref("p2", 4) } },
    ]);
  });

  it("leaves out a state the member has not played in, however long its list", () => {
    expect(stats.states.map((state) => state.key)).not.toContain("FL");
  });

  it("shows a state without a published list, with no progress", () => {
    const withTexas = profileStats([...ranking, ranked("tx", 7, { state: "TX" })], published);
    expect(withTexas.states.find((state) => state.key === "TX")).toEqual({ key: "TX", name: "Texas", courses: 1, top: ref("tx", 7), list: null });
  });

  it("names the top-ranked course in each country", () => {
    expect(stats.countries).toEqual([
      { key: "USA", name: "USA", courses: 5, top: ref("bt", 1) },
      { key: "SCOTLAND", name: "Scotland", courses: 1, top: ref("old", 5) },
    ]);
  });

  it("picks the best course played on each national list by the list's own ranks", () => {
    expect(stats.best).toEqual([
      { slug: "world", title: "World Top 100", course: ref("old", 5), published: 3 },
      { slug: "usa", title: "USA Top 100", course: ref("oh", 2), published: 20 },
      { slug: "usa-public", title: "USA Public Top 100", course: ref("p2", 4), published: 6 },
      { slug: "international", title: "International Top 100", course: ref("old", 5), published: 1 },
    ]);
  });

  it("leaves a national list with nothing played out of the best", () => {
    expect(profileStats([ranked("oh", 1, { state: "MI" })], published).best.map((best) => best.slug)).toEqual(["usa"]);
  });

  it("gives an empty ranking the national lists at zero and nothing else", () => {
    expect(profileStats([], published)).toEqual({
      courses: 0,
      national: [
        { slug: "world", title: "World Top 100", played: 0, size: 3, top: null },
        { slug: "usa", title: "USA Top 100", played: 0, size: 4, top: null },
        { slug: "usa-public", title: "USA Public Top 100", played: 0, size: 2, top: null },
        { slug: "international", title: "International Top 100", played: 0, size: 1, top: null },
      ],
      states: [],
      countries: [],
      best: [],
      hiddenGem: null,
      disagreement: null,
    });
  });
});

describe("hidden gem", () => {
  it("is the top-ranked course on no national list, naming its state list", () => {
    expect(profileStats(ranking, published).hiddenGem).toEqual({
      reason: GemReason.StateListOnly,
      course: ref("fh", 3),
      stateList: { slug: "state-mi", title: "Best in Michigan", published: 16 },
      gap: null,
    });
  });

  it("is a course on no list at all when that is the top-ranked one off the national lists", () => {
    const rows = [ranked("bt", 1, { state: "OR" }), ranked("loc", 2, { state: "MI" }), ranked("fh", 3, { state: "MI" }), ranked("oh", 4, { state: "MI" })];
    expect(profileStats(rows, published).hiddenGem).toEqual({ reason: GemReason.Unlisted, course: ref("loc", 2), stateList: null, gap: null });
  });

  it("is the course a list puts furthest below the member when the one off the national lists sits in the bottom half", () => {
    // Bandon is last of these three on the USA list and first for the member; the local course is 5th of 5.
    const rows = [ranked("bt", 1, { state: "OR" }), ranked("oh", 2, { state: "MI" }), ranked("p2", 3, { state: "NC" }), ranked("old", 4, { country: "Scotland" }), ranked("loc", 5, { state: "MI" })];
    expect(profileStats(rows, published).hiddenGem).toEqual({
      reason: GemReason.RankedHigher,
      course: ref("bt", 1),
      stateList: null,
      gap: { course: ref("bt", 1), title: "World Top 100", slug: "world", of: 3, listPosition: 3, ownPosition: 1 },
    });
  });

  it("is still the course off the national lists when no list puts anything lower than the member does", () => {
    // Two national courses in the lists' own order, then a local course in the bottom half.
    const rows = [ranked("oh", 1, { state: "MI" }), ranked("p2", 2, { state: "NC" }), ranked("x", 3, { state: "MI" }), ranked("y", 4, { state: "MI" }), ranked("loc", 5, { state: "MI" })];
    const lists = [entry("usa", "USA", "oh", 20), entry("usa", "USA", "p2", 32), entry("usa", "USA", "x", 40), entry("usa", "USA", "y", 50)];
    expect(profileStats(rows, lists).hiddenGem).toEqual({ reason: GemReason.Unlisted, course: ref("loc", 5), stateList: null, gap: null });
  });

  it("is nothing when every course is on a national list that agrees with the member", () => {
    const rows = [ranked("oh", 1, { state: "MI" }), ranked("p2", 2, { state: "NC" }), ranked("bt", 3, { state: "OR" })];
    expect(profileStats(rows, published.filter((item) => item.type === "usa")).hiddenGem).toBeNull();
  });
});

describe("biggest disagreement", () => {
  it("is the widest gap between a list's order and the member's, on the earlier list when two tie", () => {
    // Bandon is 3rd of 3 on both the World and the USA lists, and 1st for the member.
    expect(profileStats(ranking, published).disagreement).toEqual({ course: ref("bt", 1), title: "World Top 100", slug: "world", of: 3, listPosition: 3, ownPosition: 1 });
  });

  it("goes to the course the member ranks higher when two gaps tie, even on a later list", () => {
    // An unlisted course at #1 is the gem, so it stays out of this. On the World list x is two places out;
    // on the USA list w is two places out too, and the member ranks w above x.
    const rows = [ranked("g", 1, {}), ranked("w", 2, {}), ranked("x", 3, {}), ranked("y", 4, {}), ranked("z", 5, {}), ranked("a", 6, {}), ranked("b", 7, {})];
    const lists = [
      entry("global", "GLOBAL", "z", 1),
      entry("global", "GLOBAL", "y", 2),
      entry("global", "GLOBAL", "x", 3),
      entry("usa", "USA", "a", 1),
      entry("usa", "USA", "b", 2),
      entry("usa", "USA", "w", 3),
    ];
    const { hiddenGem, disagreement } = profileStats(rows, lists);
    expect(hiddenGem?.course.id).toBe("g");
    expect(disagreement).toEqual({ course: ref("w", 2), title: "USA Top 100", slug: "usa", of: 3, listPosition: 3, ownPosition: 1 });
  });

  it("never names the hidden gem's course", () => {
    // The gem falls back to Bandon (ranked higher than the lists), so the disagreement is the next widest gap.
    const rows = [ranked("bt", 1, { state: "OR" }), ranked("oh", 2, { state: "MI" }), ranked("p2", 3, { state: "NC" }), ranked("old", 4, { country: "Scotland" }), ranked("loc", 5, { state: "MI" })];
    const { hiddenGem, disagreement } = profileStats(rows, published);
    expect(hiddenGem?.course.id).toBe("bt");
    expect(disagreement).toEqual({ course: ref("old", 4), title: "World Top 100", slug: "world", of: 3, listPosition: 1, ownPosition: 3 });
  });

  it.each([
    ["no list holds three of the member's courses", [ranked("bt", 1, { state: "OR" }), ranked("p2", 2, { state: "NC" })], published],
    [
      "the member agrees with every list",
      [ranked("oh", 1, { state: "MI" }), ranked("p2", 2, { state: "NC" }), ranked("bt", 3, { state: "OR" })],
      published.filter((item) => item.type === "usa"),
    ],
  ])("is nothing when %s", (_case, rows, lists) => {
    expect(profileStats(rows, lists).disagreement).toBeNull();
  });
});

describe("shownPlaces", () => {
  const places = (count: number) => Array.from({ length: count }, (_, index) => index);

  it.each([
    [0, false, 0],
    [PLACES_SHOWN, false, PLACES_SHOWN],
    // Two past the cap still shows whole: a button for a row or two isn't worth a tap.
    [PLACES_SHOWN + 2, false, PLACES_SHOWN + 2],
    [PLACES_SHOWN + 3, false, PLACES_SHOWN],
    [50, false, PLACES_SHOWN],
    [50, true, 50],
  ])("of %i places, expanded %s, shows %i", (count, expanded, shown) => {
    expect(shownPlaces(places(count), expanded)).toEqual(places(shown));
  });
});

describe("listedPhrase", () => {
  it.each([
    [14, 13, "your", "13 of your 14 are on"],
    [3, 1, "their", "1 of their 3 is on"],
    [4, 4, "your", "All 4 are on"],
    [2, 2, "your", "Both are on"],
    [1, 1, "your", "It's on"],
    [1, 0, "your", "It isn't on"],
    [5, 0, "your", "None are on"],
  ])("%i played, %i on the list: %s", (courses, onList, whose, phrase) => {
    expect(listedPhrase(courses, onList, whose)).toBe(phrase);
  });
});
