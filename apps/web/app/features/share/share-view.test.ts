import { courseSchema, RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { imageFileName, parseShareView, sharePath, shareViewParams, shareViewTitle, viewRows, WHOLE_RANKING, type ShareView } from "./share-view";

const parse = (query: string) => parseShareView(new URLSearchParams(query));

const course = (id: string, location: string, state = ""): Course =>
  courseSchema.parse({ id, name: "Course " + id, location, state, country: location.endsWith("USA") ? "USA" : "Scotland" });

const ranking = [
  { course: course("pine", "Clementon, NJ, USA", "NJ"), rank: 1, extra: "kept" },
  { course: course("old", "St Andrews, Scotland"), rank: 2, extra: "kept" },
  { course: course("crystal", "Frankfort, MI, USA", "MI"), rank: 3, extra: "kept" },
  { course: course("arcadia", "Arcadia, MI, USA", "MI"), rank: 4, extra: "kept" },
  { course: course("kingsley", "Kingsley, MI, USA", "MI"), rank: 5, extra: "kept" },
];

describe("parseShareView", () => {
  it.each<[string, ShareView]>([
    ["", WHOLE_RANKING],
    ["view=all", WHOLE_RANKING],
    ["view=nonsense", WHOLE_RANKING],
    ["view=usa", { region: RegionFilter.USA, state: "", top: null }],
    ["view=USA", { region: RegionFilter.USA, state: "", top: null }],
    ["view=international", { region: RegionFilter.World, state: "", top: null }],
    ["view=state", { region: RegionFilter.State, state: "", top: null }],
    ["view=state-mi", { region: RegionFilter.State, state: "MI", top: null }],
    ["view=state-zz", { region: RegionFilter.State, state: "", top: null }],
    ["top=5", { ...WHOLE_RANKING, top: 5 }],
    ["view=state-mi&top=7", { region: RegionFilter.State, state: "MI", top: 7 }],
    ["top=0", WHOLE_RANKING],
    ["top=-3", WHOLE_RANKING],
    ["top=2.5", WHOLE_RANKING],
    ["top=lots", WHOLE_RANKING],
    ["top=99999999999999999999", WHOLE_RANKING],
  ])("reads %j", (query, expected) => {
    expect(parse(query)).toEqual(expected);
  });
});

describe("shareViewParams", () => {
  it.each<[ShareView, string]>([
    [WHOLE_RANKING, ""],
    [{ ...WHOLE_RANKING, top: 10 }, "top=10"],
    [{ region: RegionFilter.USA, state: "", top: null }, "view=usa"],
    [{ region: RegionFilter.World, state: "", top: 5 }, "view=international&top=5"],
    [{ region: RegionFilter.State, state: "MI", top: 5 }, "view=state-mi&top=5"],
    [{ region: RegionFilter.State, state: "", top: null }, "view=state"],
  ])("writes %j and reads it back", (view, query) => {
    expect(shareViewParams(view).toString()).toBe(query);
    expect(parse(query)).toEqual(view);
  });
});

describe("sharePath", () => {
  it("is short for the whole ranking and carries a view otherwise", () => {
    expect(sharePath("josh")).toBe("/r/josh");
    expect(sharePath("josh", { region: RegionFilter.State, state: "MI", top: 5 })).toBe("/r/josh?view=state-mi&top=5");
  });
});

describe("shareViewTitle", () => {
  it.each<[ShareView, string]>([
    [WHOLE_RANKING, "Ranking"],
    [{ ...WHOLE_RANKING, top: 10 }, "Top 10"],
    [{ region: RegionFilter.USA, state: "", top: null }, "Best in the USA"],
    [{ region: RegionFilter.USA, state: "", top: 10 }, "Top 10 in the USA"],
    [{ region: RegionFilter.World, state: "", top: null }, "Best outside the USA"],
    [{ region: RegionFilter.State, state: "MI", top: null }, "Best in Michigan"],
    [{ region: RegionFilter.State, state: "MI", top: 5 }, "Top 5 in Michigan"],
  ])("names %j", (view, title) => {
    expect(shareViewTitle(view)).toBe(title);
  });
});

describe("viewRows", () => {
  const names = (view: ShareView) => viewRows(ranking, view).map((row) => [row.course.id, row.rank]);

  it("keeps the whole ranking's order and ranks without a filter", () => {
    expect(names(WHOLE_RANKING)).toEqual([
      ["pine", 1],
      ["old", 2],
      ["crystal", 3],
      ["arcadia", 4],
      ["kingsley", 5],
    ]);
  });

  it("numbers a state's courses within the state, in the member's order", () => {
    expect(names({ region: RegionFilter.State, state: "MI", top: null })).toEqual([
      ["crystal", 1],
      ["arcadia", 2],
      ["kingsley", 3],
    ]);
  });

  it("cuts after filtering, so a Top 2 in Michigan is Michigan's first two", () => {
    expect(names({ region: RegionFilter.State, state: "MI", top: 2 })).toEqual([
      ["crystal", 1],
      ["arcadia", 2],
    ]);
  });

  it("separates the USA from everywhere else", () => {
    expect(names({ region: RegionFilter.World, state: "", top: null })).toEqual([["old", 1]]);
    expect(viewRows(ranking, { region: RegionFilter.USA, state: "", top: null })).toHaveLength(4);
  });

  it("shows every course when the Top N is longer than the view", () => {
    expect(viewRows(ranking, { ...WHOLE_RANKING, top: 25 })).toHaveLength(5);
  });

  it("holds nothing for a state view with no state", () => {
    expect(viewRows(ranking, { region: RegionFilter.State, state: "", top: null })).toEqual([]);
  });

  it("does not change the rows it was given, and keeps their other fields", () => {
    const [first] = viewRows(ranking, { region: RegionFilter.State, state: "MI", top: 1 });
    expect(first?.extra).toBe("kept");
    expect(ranking[2]?.rank).toBe(3);
  });
});

describe("imageFileName", () => {
  it.each([
    ["josh", "Top 5 in Michigan", "josh-top-5-in-michigan.png"],
    ["Josh_L", "Ranking", "josh-l-ranking.png"],
  ])("names %s's %s image", (username, title, expected) => {
    expect(imageFileName(username, title)).toBe(expected);
  });
});
