import { Relationship } from "@coursebook/domain/friends/types";

/**
 * Friendship rules (decision 2026-09-29, friends-only visibility). A pair of
 * members has at most one row: a pending request from one to the other, or
 * an accepted, mutual friendship. These functions decide from that row
 * alone; the service reads and writes it under a per-pair lock.
 */

/** The parts of a friendship row the rules need. */
export interface FriendshipState {
  requesterId: string;
  addresseeId: string;
  status: "pending" | "accepted";
}

/**
 * The viewer's relationship to the other member of a pair.
 *
 * Args:
 *     row: The pair's friendship row, or null/undefined when there is none.
 *     viewerId: The member asking.
 *
 * Returns:
 *     `friends` for an accepted row, `requested` when the viewer asked,
 *     `incoming` when the other member asked, `none` without a row.
 */
export function relationshipFor(row: FriendshipState | null | undefined, viewerId: string): Relationship {
  if (!row) return Relationship.None;
  if (row.status === "accepted") return Relationship.Friends;
  return row.requesterId === viewerId ? Relationship.Requested : Relationship.Incoming;
}

/** What a "befriend" request changes. */
export enum BefriendChange {
  /** Insert a pending request from the viewer. */
  Request = "request",
  /** Accept the other member's pending request. */
  Accept = "accept",
  /** Nothing to change: already requested by the viewer, or already friends. */
  Nothing = "nothing",
}

/**
 * Decide what befriending the other member of a pair does. Asking someone
 * who already asked you accepts their request, so crossing requests end as
 * one friendship.
 *
 * Returns:
 *     The change to make and the viewer's relationship afterwards.
 */
export function befriend(
  row: FriendshipState | null | undefined,
  viewerId: string,
): { change: BefriendChange; relationship: Relationship } {
  switch (relationshipFor(row, viewerId)) {
    case Relationship.None:
      return { change: BefriendChange.Request, relationship: Relationship.Requested };
    case Relationship.Incoming:
      return { change: BefriendChange.Accept, relationship: Relationship.Friends };
    case Relationship.Requested:
      return { change: BefriendChange.Nothing, relationship: Relationship.Requested };
    case Relationship.Friends:
      return { change: BefriendChange.Nothing, relationship: Relationship.Friends };
  }
}

/** Lock key for a pair of members, the same whichever of them acts. */
export function pairKey(a: string, b: string): string {
  return a < b ? `friendship:${a}|${b}` : `friendship:${b}|${a}`;
}
