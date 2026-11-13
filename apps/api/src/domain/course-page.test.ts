import { courseSchema } from "@coursebook/domain/catalog/course";
import { describe, expect, it } from "vitest";
import { coursePageFrom, type CoursePageRows } from "./course-page";

const course = courseSchema.parse({ id: "c1", name: "Crystal Downs", location: "Frankfort, MI, USA" });
const member = (username: string, displayName: string) => ({ username, displayName });
const friends = [
  { id: "u_priya", member: member("priya", "Priya") },
  { id: "u_ana", member: member("ana", "Ana") },
  { id: "u_ben", member: member("ben", "Ben") },
];
const rows = (overrides: Partial<CoursePageRows>): CoursePageRows => ({
  course,
  viewerId: "me",
  friends,
  ranks: [],
  sizes: [],
  wanted: [],
  ...overrides,
});

describe("coursePageFrom", () => {
  it.each([
    {
      name: "on the viewer's ranking",
      input: rows({ ranks: [{ userId: "me", rank: 3 }], sizes: [{ userId: "me", size: 42 }], wanted: [] }),
      you: { rank: 3, outOf: 42, wantToPlay: false },
    },
    {
      name: "not on it, but wanted",
      input: rows({ sizes: [{ userId: "me", size: 42 }], wanted: [{ userId: "me" }] }),
      you: { rank: null, outOf: 42, wantToPlay: true },
    },
    { name: "an empty ranking", input: rows({}), you: { rank: null, outOf: 0, wantToPlay: false } },
  ])("gives the viewer's standing: $name", ({ input, you }) => {
    expect(coursePageFrom(input).you).toEqual(you);
  });

  it("orders friends by their rank, then by name, with their ranking size", () => {
    const page = coursePageFrom(
      rows({
        ranks: [
          { userId: "u_priya", rank: 5 },
          { userId: "u_ben", rank: 1 },
          { userId: "u_ana", rank: 5 },
        ],
        sizes: [
          { userId: "u_priya", size: 30 },
          { userId: "u_ben", size: 8 },
          { userId: "u_ana", size: 12 },
        ],
      }),
    );
    expect(page.friendsRanked).toEqual([
      { member: member("ben", "Ben"), rank: 1, outOf: 8 },
      { member: member("ana", "Ana"), rank: 5, outOf: 12 },
      { member: member("priya", "Priya"), rank: 5, outOf: 30 },
    ]);
  });

  it("lists friends who want to play it by name", () => {
    const page = coursePageFrom(rows({ wanted: [{ userId: "u_priya" }, { userId: "u_ana" }, { userId: "me" }] }));
    expect(page.friendsWantToPlay).toEqual([member("ana", "Ana"), member("priya", "Priya")]);
  });

  it("never shows a member who is not the viewer's friend", () => {
    const page = coursePageFrom(rows({ ranks: [{ userId: "stranger", rank: 1 }], wanted: [{ userId: "stranger" }] }));
    expect(page.friendsRanked).toEqual([]);
    expect(page.friendsWantToPlay).toEqual([]);
  });
});
