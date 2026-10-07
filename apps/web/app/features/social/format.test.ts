import { courseSchema } from "@coursebook/domain/catalog/course";
import { FeedItemType, type FeedItem, type TimelineRound } from "@coursebook/domain/social/types";
import { describe, expect, it } from "vitest";
import {
  AvatarTone,
  CourseTone,
  avatarTone,
  courseTone,
  dayOfMonth,
  groupByMonth,
  initials,
  newFromFriends,
  ordinal,
  percent,
  relativeDay,
  shortDate,
  shortPlace,
  visitLabel,
} from "./format";

const course = (id: string, overrides: Record<string, unknown> = {}) =>
  courseSchema.parse({ id, name: "Course " + id, location: "Somewhere", country: "USA", ...overrides });

const round = (id: string, playedOn: string | null, courseId = id): TimelineRound => ({
  id,
  course: course(courseId),
  playedOn,
  visit: 1,
  rank: 1,
});

describe("ordinals and visits", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [4, "4th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [102, "102nd"],
    [111, "111th"],
  ])("writes %s as %s", (n, text) => {
    expect(ordinal(n)).toBe(text);
  });

  it.each([
    [1, "First visit"],
    [2, "2nd round"],
    [23, "23rd round"],
  ])("labels visit %s as %s", (visit, label) => {
    expect(visitLabel(visit)).toBe(label);
  });
});

describe("dates", () => {
  const now = new Date(2026, 8, 29, 20, 0); // Sep 29, 2026, 8 pm local

  it.each([
    [new Date(2026, 8, 29, 7, 0), "Today"],
    [new Date(2026, 8, 28, 23, 59), "Yesterday"],
    [new Date(2026, 8, 26, 12, 0), "3 days ago"],
    [new Date(2026, 8, 22, 12, 0), "Sep 22"],
    [new Date(2025, 11, 31, 12, 0), "Dec 31, 2025"],
  ])("says %s is %s", (then, text) => {
    expect(relativeDay(then.toISOString(), now)).toBe(text);
  });

  it("reads date-only values without shifting them across time zones", () => {
    expect(shortDate("2026-01-01", now)).toBe("Jan 1");
    expect(shortDate("2015-06-30", now)).toBe("Jun 30, 2015");
    expect(dayOfMonth("2026-09-07")).toBe("7");
    expect(dayOfMonth(null)).toBe("–");
  });

  it("groups consecutive rounds by month, undated last, with the API's totals", () => {
    const groups = groupByMonth(
      [round("a", "2026-09-27"), round("b", "2026-09-02"), round("c", "2026-08-30"), round("d", "2015-08-01"), round("e", null)],
      [
        { month: "2026-09", rounds: 2 },
        { month: "2026-08", rounds: 1 },
        { month: "2015-08", rounds: 1 },
        { month: null, rounds: 1 },
      ],
    );
    expect(groups.map((group) => [group.label, group.rounds.map((r) => r.id), group.total])).toEqual([
      ["September 2026", ["a", "b"], 2],
      ["August 2026", ["c"], 1],
      ["August 2015", ["d"], 1],
      ["Date not recorded", ["e"], 1],
    ]);
  });

  it("shows a month's full total when a page cuts it off", () => {
    // The first page ends two rounds into a five-round September.
    const groups = groupByMonth([round("a", "2026-10-01"), round("b", "2026-09-20"), round("c", "2026-09-10")], [
      { month: "2026-10", rounds: 1 },
      { month: "2026-09", rounds: 5 },
    ]);
    expect(groups.map((group) => [group.key, group.rounds.length, group.total])).toEqual([
      ["2026-10", 1, 1],
      ["2026-09", 2, 5],
    ]);
  });

  it("counts the rounds loaded for a month the API sent no total for", () => {
    expect(groupByMonth([round("a", "2026-09-27"), round("b", "2026-09-02")], []).map((group) => group.total)).toEqual([2]);
  });
});

describe("names and tones", () => {
  it.each([
    ["Maya Chen", "linksrat", "MC"],
    ["Mary Jo van Buren", "mj", "MB"],
    ["Cher", "cher", "CH"],
    ["  ", "sandtrapsam", "SA"],
  ])("gives %s the initials %s", (name, username, text) => {
    expect(initials(name, username)).toBe(text);
  });

  it("gives each member one stable avatar tone, whatever the case", () => {
    expect(avatarTone("LinksRat")).toBe(avatarTone("linksrat"));
    expect(Object.values(AvatarTone)).toContain(avatarTone("anyone"));
  });

  it.each([
    [{ country: "Scotland", state: "", location: "St Andrews, Fife, Scotland" }, CourseTone.Heath],
    [{ country: "UK", state: "", location: "St Andrews, Fife, UK" }, CourseTone.Heath],
    [{ country: "Netherlands", state: "", location: "The Hague" }, CourseTone.Sea],
    [{ country: "USA", state: "NE", location: "Mullen, NE, USA" }, CourseTone.Sand],
    [{ country: "USA", state: "ca", location: "Pebble Beach, CA, USA" }, CourseTone.Sea],
    [{ country: "USA", state: "MI", location: "Kingsley, MI, USA" }, CourseTone.Pine],
    [{ country: "USA", state: "", location: "Unknown" }, CourseTone.Pine],
  ])("tones %o as %s", (place, tone) => {
    expect(courseTone(place)).toBe(tone);
  });

  it("writes a short place for tiles", () => {
    expect(shortPlace({ city: "Mullen", state: "NE", country: "USA" })).toBe("Mullen, NE");
    expect(shortPlace({ city: "St Andrews", state: "", country: "Scotland" })).toBe("St Andrews, Scotland");
    expect(shortPlace({ city: "", state: "", country: "USA" })).toBe("");
  });

  it("formats agreement as a whole percent", () => {
    expect(percent(2 / 3)).toBe("67%");
  });
});

describe("newFromFriends", () => {
  const member = { username: "maya", displayName: "Maya" };
  const item = (id: string, type: FeedItemType, rounds: TimelineRound[]): FeedItem => ({
    id,
    type,
    at: "2026-09-29T12:00:00.000000Z",
    member,
    rounds,
    count: rounds.length,
  });

  it("takes the newest round items, one per course, skipping backfill", () => {
    const picks = newFromFriends(
      [
        item("1", FeedItemType.Round, [round("r1", "2026-09-28", "sand")]),
        item("2", FeedItemType.Backfill, [round("r2", "2015-01-01", "pine")]),
        item("3", FeedItemType.Round, [round("r3", "2026-09-20", "sand")]),
        item("4", FeedItemType.Round, [round("r4", "2026-09-19", "old")]),
        item("5", FeedItemType.Round, [round("r5", "2026-09-18", "kings")]),
      ],
      2,
    );
    expect(picks.map((pick) => pick.round.id)).toEqual(["r1", "r4"]);
  });
});
