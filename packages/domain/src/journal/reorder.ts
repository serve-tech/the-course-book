/**
 * Pure ranking order rules.
 *
 * A ranking is an ordered array of course ids whose index + 1 is the
 * personal rank. Only Ranked courses are in it; Played courses (on the list
 * without a rank) never are. Reordering always operates on the complete
 * ranking, never on a filtered view, so courses hidden by a search or
 * geographic filter keep their positions. See docs/architecture.md, "Data
 * rules".
 */

/** Clamp a requested rank into [1, size], treating NaN and 0 as 1. */
export function clampRank(requested: number, size: number): number {
  return Math.max(1, Math.min(size, Math.floor(requested) || 1));
}

/**
 * Clamp the rank at which a new course is inserted into a list of `size`
 * courses: [1, size + 1], defaulting to the bottom when no rank is given.
 */
export function insertionRank(
  requested: number | null | undefined,
  size: number,
): number {
  if (requested === null || requested === undefined) return size + 1;
  return clampRank(requested, size + 1);
}

/**
 * Move `id` to `requestedRank` within `ids` and return the new order.
 *
 * Args:
 *     ids: The complete current order (hidden courses included).
 *     id: The course to move. An id not in the list leaves the order untouched.
 *     requestedRank: 1-based target rank; clamped into [1, ids.length].
 *
 * Returns:
 *     A new array; the input is never mutated.
 */
export function reorder(
  ids: readonly string[],
  id: string,
  requestedRank: number,
): string[] {
  if (!ids.includes(id)) return [...ids];
  const order = ids.filter((item) => item !== id);
  order.splice(clampRank(requestedRank, ids.length) - 1, 0, id);
  return order;
}

/** Insert `id` at `requestedRank` (see insertionRank) and return the new order. */
export function insertAt(
  ids: readonly string[],
  id: string,
  requestedRank: number | null | undefined,
): string[] {
  const order = ids.filter((item) => item !== id);
  order.splice(insertionRank(requestedRank, order.length) - 1, 0, id);
  return order;
}

/**
 * Put `id` at `requestedRank` in a ranking and return the new order.
 *
 * A course already in the ranking moves there (`reorder`, clamped to
 * [1, N]). A course that is not, such as a Played course being ranked, is
 * inserted (`insertAt`, clamped to [1, N + 1]). Either way the courses from
 * that position down shift by one and every other course keeps its order.
 *
 * Args:
 *     ranked: The complete ranking (hidden courses included).
 *     id: The course to place.
 *     requestedRank: 1-based target rank; NaN and values below 1 mean 1.
 *
 * Returns:
 *     A new array; the input is never mutated.
 *
 * Example:
 *     >>> placeInRanking(["a", "b"], "played", 2)
 *     ["a", "played", "b"]
 */
export function placeInRanking(ranked: readonly string[], id: string, requestedRank: number): string[] {
  return ranked.includes(id) ? reorder(ranked, id, requestedRank) : insertAt(ranked, id, requestedRank);
}
