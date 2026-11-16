import { describe, expect, it } from "vitest";
import { compareTopLists, isNationalList, isStateList, topListTitle } from "./top-lists";

describe("topListTitle", () => {
  it.each([
    ["global", "GLOBAL", "World Top 100"],
    ["world", "WORLD", "International Top 100"],
    ["usa", "USA", "USA Top 100"],
    ["usa_public", "USA_PUBLIC", "USA Public Top 100"],
    ["state", "FL", "Best in Florida"],
    ["state", "mi", "Best in Michigan"],
    ["future_list", "EUROPE", "EUROPE"],
  ])("titles %s/%s as %s", (type, scope, title) => {
    expect(topListTitle(type, scope)).toBe(title);
  });
});

describe("list kinds", () => {
  it.each([
    ["global", true, false],
    ["usa_public", true, false],
    ["state", false, true],
    ["future_list", false, false],
  ])("%s: national %s, state %s", (type, national, state) => {
    expect(isNationalList(type)).toBe(national);
    expect(isStateList(type)).toBe(state);
  });
});

describe("compareTopLists", () => {
  it("puts the national lists first in a fixed order, then the rest by title", () => {
    const lists = [
      { type: "state", title: "Best in Nebraska" },
      { type: "world", title: "International Top 100" },
      { type: "state", title: "Best in Florida" },
      { type: "usa", title: "USA Top 100" },
      { type: "global", title: "World Top 100" },
      { type: "usa_public", title: "USA Public Top 100" },
    ];
    expect(lists.sort(compareTopLists).map((list) => list.title)).toEqual([
      "World Top 100",
      "USA Top 100",
      "USA Public Top 100",
      "International Top 100",
      "Best in Florida",
      "Best in Nebraska",
    ]);
  });
});
