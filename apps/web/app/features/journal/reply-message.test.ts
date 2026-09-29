import { describe, expect, it } from "vitest";
import { replyMessages } from "./reply-message";

describe("journal reply messages", () => {
  it.each([
    [replyMessages.logged(1), "1 round added"],
    [replyMessages.logged(3), "3 rounds added"],
    [replyMessages.addedToList(true), "Added to My List"],
    [replyMessages.addedToList(false), "Already on your list"],
    [replyMessages.addedCourse(4), "Course added at #4"],
    [replyMessages.moved(1), "Moved to #1"],
    [replyMessages.counted(5, false), "Rounds updated to 5"],
    [replyMessages.counted(0, true), "Course removed"],
    [replyMessages.deletedRound(false), "Round deleted"],
    [replyMessages.deletedRound(true), "Round deleted; course removed from My List"],
    [replyMessages.deletedCourse(), "Course deleted from My List"],
  ])("%s", (actual, expected) => {
    expect(actual).toBe(expected);
  });
});
