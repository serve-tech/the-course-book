import { describe, expect, it } from "vitest";
import { toPublicMember } from "./authz";

const member = { id: "user_a", username: "alpha", displayName: "Alpha" };

describe("authorization rules", () => {
  it("strips everything but username and display name from a member", () => {
    const row = { ...member, email: "alpha@example.com", legacySupabaseId: "x" };
    expect(toPublicMember(row)).toEqual({ username: "alpha", displayName: "Alpha" });
  });
});
