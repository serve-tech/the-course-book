import { describe, expect, it } from "vitest";
import { findPublishedList, friendsProgress, friendsWhoPlayed, playedOn, publishedLists, type FriendCourses, type PublishedRank } from "./top-lists";

const rank = (type: string, scope: string, value: number, courseId: string, source = "Golf Digest"): PublishedRank => ({
  type,
  scope,
  rank: value,
  courseId,
  source,
  sourceYear: 2025,
});
const rows = [
  rank("usa", "USA", 2, "augusta"),
  rank("state", "mi", 1, "crystal"),
  rank("usa", "USA", 1, "pine"),
  rank("global", "GLOBAL", 1, "pine", "GOLF Magazine"),
  rank("state", "GA", 1, "augusta"),
  rank("world", "WORLD", 1, "rcd"),
];
const friend = (name: string, courses: string[]): FriendCourses => ({
  member: { username: name.toLowerCase(), displayName: name },
  courses: new Set(courses),
});

describe("publishedLists", () => {
  it("groups rows into lists in display order, entries by rank, with title, size and source", () => {
    const lists = publishedLists(rows);
    expect(lists.map((list) => list.info.title)).toEqual(["World Top 100", "USA Top 100", "International Top 100", "Best in Georgia", "Best in Michigan"]);
    expect(lists[1]?.entries.map((entry) => entry.courseId)).toEqual(["pine", "augusta"]);
    expect(lists[0]?.info).toEqual({ type: "global", scope: "GLOBAL", title: "World Top 100", size: 1, source: "GOLF Magazine", sourceYear: 2025 });
  });

  it("finds a list by type and scope, whatever the scope's case", () => {
    expect(findPublishedList(publishedLists(rows), "state", "mi")?.info.title).toBe("Best in Michigan");
    expect(findPublishedList(publishedLists(rows), "state", "zz")).toBeUndefined();
  });
});

describe("progress", () => {
  const usa = findPublishedList(publishedLists(rows), "usa", "USA");
  if (!usa) throw new Error("no USA list");
  const friends = [friend("Priya", ["pine", "augusta"]), friend("Dan", ["augusta", "crystal"]), friend("Ellie", ["crystal"]), friend("Al", ["pine"])];

  it("counts played courses by id", () => {
    expect(playedOn(usa, new Set(["pine", "rcd"]))).toBe(1);
  });

  it("lists friends who played any of it, most first, then by name", () => {
    expect(friendsProgress(usa, friends).map((progress) => `${progress.member.displayName} ${String(progress.played)}`)).toEqual([
      "Priya 2",
      "Al 1",
      "Dan 1",
    ]);
  });

  it("names the friends who played a course, by display name", () => {
    expect(friendsWhoPlayed("augusta", friends).map((member) => member.displayName)).toEqual(["Dan", "Priya"]);
    expect(friendsWhoPlayed("rcd", friends)).toEqual([]);
  });
});
