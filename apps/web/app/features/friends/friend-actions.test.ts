import { describe, expect, it } from "vitest";
import { Relationship } from "@coursebook/domain/friends/types";
import {
  FriendIntent,
  UnfriendReason,
  befriendMessage,
  relationshipButton,
  toRelationship,
  unfriendMessage,
} from "./friend-actions";

describe("friend actions", () => {
  it.each<[string, Relationship]>([
    ["none", Relationship.None],
    ["friends", Relationship.Friends],
    ["requested", Relationship.Requested],
    ["incoming", Relationship.Incoming],
    ["blocked", Relationship.None],
  ])("reads the API relationship %s", (value, relationship) => {
    expect(toRelationship(value)).toBe(relationship);
  });

  it.each<[Relationship, string, FriendIntent | null]>([
    [Relationship.None, "Add friend", FriendIntent.Befriend],
    [Relationship.Incoming, "Accept", FriendIntent.Befriend],
    [Relationship.Requested, "Requested", null],
    [Relationship.Friends, "Friends", null],
  ])("shows a %s search result as %s", (relationship, label, intent) => {
    expect(relationshipButton(relationship)).toEqual({ label, intent });
  });

  it("words each outcome", () => {
    expect(befriendMessage(Relationship.Requested, "bravo")).toBe("Friend request sent to bravo.");
    expect(befriendMessage(Relationship.Friends, "bravo")).toBe("You and bravo are now friends.");
    expect(unfriendMessage(UnfriendReason.Remove, "bravo")).toBe("bravo is no longer your friend.");
    expect(unfriendMessage(UnfriendReason.Cancel, "bravo")).toBe("Request to bravo canceled.");
    expect(unfriendMessage(UnfriendReason.Decline, "bravo")).toBe("Request from bravo declined.");
  });
});
