import { describe, expect, it } from "vitest";
import { topListProgress, topListTitle, type TopListEntry } from "./top-lists";

describe("topListTitle", () => {
  it.each([
    ["world", "WORLD", "World Top 100"],
    ["usa", "USA", "USA Top 100"],
    ["usa_public", "USA_PUBLIC", "USA Public Top 100"],
    ["state", "FL", "Best in Florida"],
    ["state", "mi", "Best in Michigan"],
    ["future_list", "EUROPE", "EUROPE"],
  ])("titles %s/%s as %s", (type, scope, title) => {
    expect(topListTitle(type, scope)).toBe(title);
  });
});

describe("topListProgress", () => {
  const entries: TopListEntry[] = [
    { courseId: "pine", type: "usa", scope: "USA" },
    { courseId: "sand", type: "usa", scope: "USA" },
    { courseId: "old", type: "world", scope: "WORLD" },
    { courseId: "pac", type: "usa_public", scope: "USA_PUBLIC" },
    { courseId: "sand", type: "state", scope: "NE" },
    { courseId: "kings", type: "state", scope: "MI" },
    { courseId: "arc", type: "state", scope: "MI" },
    { courseId: "fl1", type: "state", scope: "FL" },
  ];

  it("counts played courses per list and keeps national lists even when unplayed", () => {
    expect(topListProgress(entries, new Set(["sand", "kings", "arc"]))).toEqual([
      { type: "usa", scope: "USA", title: "USA Top 100", size: 2, played: 1 },
      { type: "world", scope: "WORLD", title: "World Top 100", size: 1, played: 0 },
      { type: "usa_public", scope: "USA_PUBLIC", title: "USA Public Top 100", size: 1, played: 0 },
      { type: "state", scope: "MI", title: "Best in Michigan", size: 2, played: 2 },
      { type: "state", scope: "NE", title: "Best in Nebraska", size: 1, played: 1 },
    ]);
  });

  it("shows only the national lists for a member with no courses", () => {
    expect(topListProgress(entries, new Set()).map((list) => list.type)).toEqual(["usa", "world", "usa_public"]);
  });
});
