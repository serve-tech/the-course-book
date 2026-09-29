import { Relationship } from "@coursebook/domain/friends/types";

/**
 * Friend actions on the Friends page (decision 2026-09-29, friends-only
 * visibility): what each relationship lets the viewer do, and the message
 * after each action. Pure, so the page and its tests share one source.
 */

/** Form intents of the Friends route's action. */
export enum FriendIntent {
  /** Send a request, or accept one from that member. */
  Befriend = "befriend",
  /** End a friendship or pending request. */
  Unfriend = "unfriend",
}

/** Why the viewer ends something, which decides the message. */
export enum UnfriendReason {
  Remove = "remove",
  Cancel = "cancel",
  Decline = "decline",
}

/** The button a search result shows for a relationship. */
export interface RelationshipButton {
  label: string;
  /** The intent the button submits; null when it is disabled. */
  intent: FriendIntent | null;
}

/** Map the API's relationship string; values added later read as no relationship. */
export function toRelationship(value: string): Relationship {
  return (Object.values(Relationship) as string[]).includes(value) ? (value as Relationship) : Relationship.None;
}

/** The button for a search result. */
export function relationshipButton(relationship: Relationship): RelationshipButton {
  switch (relationship) {
    case Relationship.None:
      return { label: "Add friend", intent: FriendIntent.Befriend };
    case Relationship.Incoming:
      return { label: "Accept", intent: FriendIntent.Befriend };
    case Relationship.Requested:
      return { label: "Requested", intent: null };
    case Relationship.Friends:
      return { label: "Friends", intent: null };
  }
}

/** The message after befriending, from the relationship the API returned. */
export function befriendMessage(relationship: Relationship, name: string): string {
  return relationship === Relationship.Friends ? `You and ${name} are now friends.` : `Friend request sent to ${name}.`;
}

/** The message after ending a friendship or request. */
export function unfriendMessage(reason: UnfriendReason, name: string): string {
  switch (reason) {
    case UnfriendReason.Remove:
      return `${name} is no longer your friend.`;
    case UnfriendReason.Cancel:
      return `Request to ${name} canceled.`;
    case UnfriendReason.Decline:
      return `Request from ${name} declined.`;
  }
}
