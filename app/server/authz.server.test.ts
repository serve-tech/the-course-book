import { describe, expect, it } from "vitest";
import {
  canSearchCourses,
  canViewMemberLists,
  ownsJournal,
  toPublicMember,
} from "./authz.server";

const member = { id: "user_a", username: "alpha", displayName: "Alpha" };

describe("authorization rules", () => {
  it("limits member lists and course search to signed-in members", () => {
    expect(canViewMemberLists(null)).toBe(false);
    expect(canSearchCourses(null)).toBe(false);
    expect(canViewMemberLists(member)).toBe(true);
    expect(canSearchCourses(member)).toBe(true);
  });

  it("lets only the owner write a journal", () => {
    expect(ownsJournal(member, "user_a")).toBe(true);
    expect(ownsJournal(member, "user_b")).toBe(false);
    expect(ownsJournal(null, "user_a")).toBe(false);
  });

  it("strips everything but username and display name from a member", () => {
    expect(
      toPublicMember({
        ...member,
        email: "alpha@example.com",
        legacySupabaseId: "x",
      } as never),
    ).toEqual({ username: "alpha", displayName: "Alpha" });
  });
});
