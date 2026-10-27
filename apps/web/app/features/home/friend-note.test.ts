import { describe, expect, it } from "vitest";
import { courseSchema, type Course } from "@coursebook/domain/catalog/course";
import { friendNote, myRanks } from "./friend-note";

const course = (id: string, fields: Partial<Course> = {}): Course =>
  courseSchema.parse({ id, name: "Course " + id, location: "Somewhere, MI, USA", country: "USA", state: "MI", ...fields });

describe("friendNote", () => {
  const ranks = myRanks([
    { course: course("mine"), rank: 2, played: 1 },
    { course: course("also-mine"), rank: 7, played: 3 },
  ]);

  it.each([
    { name: "the viewer's rank wins over published ranks", course: course("mine", { usa: 38 }), note: "Your #2" },
    { name: "the first published rank otherwise", course: course("theirs", { usa: 38, stateRank: 4 }), note: "USA #38" },
    { name: "a state rank names the state", course: course("theirs", { stateRank: 89 }), note: "Michigan #89" },
    { name: "nothing for an unranked course", course: course("theirs"), note: null },
  ])("$name", ({ course: subject, note }) => {
    expect(friendNote(subject, ranks)).toBe(note);
  });
});
