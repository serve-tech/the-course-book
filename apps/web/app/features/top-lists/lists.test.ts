import { describe, expect, it } from "vitest";
import { courseSchema, type Course, type RankedCourse } from "@coursebook/domain/catalog/course";
import {
  availableLists,
  busiestState,
  chooseList,
  friendsLine,
  isCompleteList,
  listTab,
  filterEntries,
  findList,
  listEntries,
  ListTab,
  parseListTab,
  rankingOwner,
  PlayedFilter,
  playedCount,
  rankBadges,
  tabList,
  topListSlug,
} from "./lists";

const course = (id: string, fields: Partial<Course> = {}): Course =>
  courseSchema.parse({ id, name: "Course " + id, location: "Somewhere, MI, USA", country: "USA", state: "MI", ...fields });
const entry = (id: string, rank: number, type = "usa", scope = "USA", fields: Partial<Course> = {}): RankedCourse => ({
  course: course(id, fields),
  rank,
  type,
  scope,
});
const usa100 = Array.from({ length: 100 }, (_, index) => entry("u" + String(index + 1), index + 1));

describe("list names in URLs", () => {
  it.each([
    { list: { type: "global", scope: "GLOBAL" }, slug: "world" },
    { list: { type: "usa", scope: "USA" }, slug: "usa" },
    { list: { type: "usa_public", scope: "USA_PUBLIC" }, slug: "usa-public" },
    { list: { type: "world", scope: "WORLD" }, slug: "international" },
    { list: { type: "state", scope: "MI" }, slug: "state-mi" },
    { list: { type: "future_list", scope: "EUROPE" }, slug: "future-list" },
  ])("$slug", ({ list, slug }) => {
    expect(topListSlug(list)).toBe(slug);
    expect(findList(slug.toUpperCase(), [{ type: "usa", scope: "USA" }, list])).toEqual(list);
  });

  it("finds nothing for a list that is not published", () => {
    expect(findList("state-zz", availableLists(usa100))).toBeNull();
  });

  it("lists each published list once, with upper-case scopes", () => {
    expect(availableLists([entry("a", 1), entry("b", 2), entry("c", 1, "state", "mi")])).toEqual([
      { type: "usa", scope: "USA" },
      { type: "state", scope: "MI" },
    ]);
  });
});

describe("tabs", () => {
  it.each([
    { stored: "", tab: ListTab.World },
    { stored: "usa", tab: ListTab.USA },
    { stored: "international", tab: ListTab.International },
    { stored: "state", tab: ListTab.State },
    { stored: "golf-magazine", tab: ListTab.World },
  ])("opens $stored as $tab", ({ stored, tab }) => {
    expect(parseListTab(stored)).toBe(tab);
  });

  it("needs a state for the State tab", () => {
    expect(tabList(ListTab.State, "")).toBeNull();
    expect(tabList(ListTab.State, "ga")).toEqual({ type: "state", scope: "GA" });
    expect(tabList(ListTab.Public, "")).toEqual({ type: "usa_public", scope: "USA_PUBLIC" });
    expect(tabList(ListTab.World, "")).toEqual({ type: "global", scope: "GLOBAL" });
    expect(tabList(ListTab.International, "")).toEqual({ type: "world", scope: "WORLD" });
  });
});

describe("listEntries", () => {
  it("returns one list in rank order, complete with 100 distinct ranks", () => {
    const { entries, complete } = listEntries([...usa100].reverse(), { type: "usa", scope: "USA" });
    expect(entries.map((row) => row.rank)).toEqual(usa100.map((row) => row.rank));
    expect(complete).toBe(true);
  });

  it.each([
    { name: "a short national list", rows: usa100.slice(1), list: { type: "usa", scope: "USA" } },
    { name: "a repeated rank", rows: [...usa100.slice(1), entry("dup", 2)], list: { type: "usa", scope: "USA" } },
    { name: "an empty state list", rows: usa100, list: { type: "state", scope: "MI" } },
  ])("is incomplete with $name", ({ rows, list }) => {
    expect(listEntries(rows, list).complete).toBe(false);
  });

  it("matches a state list whatever the scope's case", () => {
    expect(listEntries([entry("a", 1, "state", "mi")], { type: "state", scope: "MI" })).toMatchObject({ complete: true, entries: [{ rank: 1 }] });
  });
});

describe("filterEntries", () => {
  const rows = [entry("a", 1, "usa", "USA", { name: "Pebble Beach Golf Links" }), entry("b", 2, "usa", "USA", { name: "Shinnecock Hills" })];
  const played = new Set(["a"]);

  it.each([
    { filter: PlayedFilter.All, query: "", ids: ["a", "b"] },
    { filter: PlayedFilter.Played, query: "", ids: ["a"] },
    { filter: PlayedFilter.NotPlayed, query: "", ids: ["b"] },
    { filter: PlayedFilter.All, query: "shinn", ids: ["b"] },
    { filter: PlayedFilter.All, query: "PEBBLE beach golf", ids: ["a"] },
    { filter: PlayedFilter.Played, query: "shinn", ids: [] },
  ])("$filter / '$query'", ({ filter, query, ids }) => {
    expect(filterEntries(rows, { filter, played, query }).map((row) => row.course.id)).toEqual(ids);
  });

  it("counts played entries", () => {
    expect(playedCount(rows, played)).toBe(1);
  });
});

describe("rankBadges", () => {
  it("lists every rank, World first and the course's state last", () => {
    const augusta = course("augusta", { state: "GA", global: 8, usa: 2, stateRank: 1 });
    expect(rankBadges(augusta).map((badge) => `${badge.label} #${String(badge.rank)}`)).toEqual(["World #8", "USA #2", "Georgia #1"]);
    const pebble = course("pebble", { state: "CA", global: 20, usa: 9, public: 1, stateRank: 2 });
    expect(rankBadges(pebble).map((badge) => badge.label)).toEqual(["World", "USA", "USA Public", "California"]);
    expect(rankBadges(pebble).at(-1)?.list).toEqual({ type: "state", scope: "CA" });
  });

  it("calls Golf Digest's list outside the US International", () => {
    const oldCourse = course("old", { country: "Scotland", state: "Fife", global: 3, world: 3 });
    expect(rankBadges(oldCourse).map((badge) => `${badge.label} #${String(badge.rank)}`)).toEqual(["World #3", "International #3"]);
    expect(rankBadges(oldCourse)[0]?.list).toEqual({ type: "global", scope: "GLOBAL" });
  });

  it("has none for an unranked course", () => {
    expect(rankBadges(course("muni"))).toEqual([]);
  });
});

describe("rankingOwner", () => {
  it.each([
    { owner: null, label: "Your ranking" },
    { owner: "Dan Whitaker", label: "Dan Whitaker's ranking" },
    { owner: "James", label: "James's ranking" },
  ])("$label", ({ owner, label }) => {
    expect(rankingOwner(owner)).toBe(label);
  });
});

describe("choosing the list", () => {
  const lists = [
    { type: "global", scope: "GLOBAL" },
    { type: "usa", scope: "USA" },
    { type: "state", scope: "MI" },
  ];
  it.each([
    { name: "a published list in the URL", requested: "usa", remembered: "world", state: "", tab: ListTab.USA, list: { type: "usa", scope: "USA" } },
    { name: "a state list in the URL", requested: "state-mi", remembered: "", state: "OR", tab: ListTab.State, list: { type: "state", scope: "MI" } },
    { name: "a bare state request", requested: "state", remembered: "", state: "MI", tab: ListTab.State, list: null },
    { name: "an unknown list, falling back to the remembered tab", requested: "state-zz", remembered: "usa", state: "", tab: ListTab.USA, list: { type: "usa", scope: "USA" } },
    { name: "nothing, on a first visit", requested: null, remembered: "", state: "", tab: ListTab.World, list: { type: "global", scope: "GLOBAL" } },
    { name: "the remembered State tab with a state", requested: null, remembered: "state", state: "ga", tab: ListTab.State, list: { type: "state", scope: "GA" } },
    { name: "the remembered State tab without one", requested: null, remembered: "state", state: "", tab: ListTab.State, list: null },
  ])("picks $name", ({ requested, remembered, state, tab, list }) => {
    expect(chooseList({ requested, remembered, state, lists })).toEqual({ tab, list });
  });

  it("maps lists to their tabs", () => {
    expect(listTab({ type: "world", scope: "WORLD" })).toBe(ListTab.International);
    expect(listTab({ type: "state", scope: "TX" })).toBe(ListTab.State);
    expect(listTab({ type: "future_list", scope: "EUROPE" })).toBeNull();
  });

  it("finds the state someone has played most of", () => {
    const standing = (scope: string, mine: number) => ({ list: { type: "state", scope }, mine });
    expect(busiestState([standing("OR", 2), standing("MI", 5), standing("GA", 5), { list: { type: "usa", scope: "USA" }, mine: 9 }])).toBe("GA");
    expect(busiestState([standing("MI", 0)])).toBe("");
  });

  it("knows a complete list", () => {
    expect(isCompleteList({ type: "usa", scope: "USA" }, Array.from({ length: 100 }, (_, index) => index + 1))).toBe(true);
    expect(isCompleteList({ type: "usa", scope: "USA" }, [1, 2])).toBe(false);
    expect(isCompleteList({ type: "state", scope: "MI" }, [1, 1])).toBe(false);
  });
});

describe("friendsLine", () => {
  const member = (displayName: string) => ({ username: displayName.toLowerCase(), displayName });
  it.each([
    { names: [], line: "" },
    { names: ["Priya"], line: "Priya played it" },
    { names: ["Priya", "Dan"], line: "Priya and Dan played it" },
    { names: ["Priya", "Dan", "Kevin"], line: "Priya and 2 other friends played it" },
  ])("$line", ({ names, line }) => {
    expect(friendsLine(names.map(member))).toBe(line);
  });
});
