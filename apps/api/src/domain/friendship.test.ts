import { describe, expect, it } from "vitest";
import { Relationship } from "@coursebook/domain/friends/types";
import { BefriendChange, befriend, relationshipFor, type FriendshipState } from "./friendship";

const row = (requesterId: string, addresseeId: string, status: FriendshipState["status"]): FriendshipState => ({
  requesterId,
  addresseeId,
  status,
});

describe("friendship rules", () => {
  it.each<[string, FriendshipState | null, Relationship, BefriendChange, Relationship]>([
    ["no row", null, Relationship.None, BefriendChange.Request, Relationship.Requested],
    ["the viewer asked", row("me", "them", "pending"), Relationship.Requested, BefriendChange.Nothing, Relationship.Requested],
    ["the other member asked", row("them", "me", "pending"), Relationship.Incoming, BefriendChange.Accept, Relationship.Friends],
    ["accepted, viewer asked", row("me", "them", "accepted"), Relationship.Friends, BefriendChange.Nothing, Relationship.Friends],
    ["accepted, other asked", row("them", "me", "accepted"), Relationship.Friends, BefriendChange.Nothing, Relationship.Friends],
  ])("%s", (_label, state, relationship, change, after) => {
    expect(relationshipFor(state, "me")).toBe(relationship);
    expect(befriend(state, "me")).toEqual({ change, relationship: after });
  });
});
