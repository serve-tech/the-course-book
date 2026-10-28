/**
 * Which months a timeline page touches, so the page can carry full round
 * counts for exactly those months. A page holds consecutive rounds in
 * timeline order (newest played first, undated last), so its dated rounds
 * span one unbroken range of months.
 */

/** The months a page touches, as bounds for `played_at` and a flag for undated rounds. */
export interface MonthWindow {
  /**
   * `from` is the first day of the oldest month on the page and `until` the
   * first day of the month after the newest (exclusive). Null when the page
   * has no dated rounds.
   */
  dated: { from: string; until: string } | null;
  /** Whether the page holds rounds without a date. */
  undated: boolean;
}

/** "2026-09-14" -> "2026-09-01". */
function monthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01";
}

/** "2026-09-14" -> "2026-10-01"; December rolls into January. */
function nextMonthStart(isoDate: string): string {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  return month === 12 ? String(year + 1) + "-01-01" : String(year) + "-" + String(month + 1).padStart(2, "0") + "-01";
}

/**
 * The months touched by a page's played dates.
 *
 * Args:
 *     playedOns: Each round's ISO date (YYYY-MM-DD), or null when undated,
 *         in any order.
 *
 * Returns:
 *     The window; `dated` is null and `undated` false for an empty page.
 *
 * Example:
 *     monthWindow(["2026-10-02", "2026-09-14", null])
 *     // { dated: { from: "2026-09-01", until: "2026-11-01" }, undated: true }
 */
export function monthWindow(playedOns: readonly (string | null)[]): MonthWindow {
  const dated = playedOns.filter((value): value is string => value !== null).sort();
  const oldest = dated[0];
  const newest = dated.at(-1);
  return {
    dated: oldest && newest ? { from: monthStart(oldest), until: nextMonthStart(newest) } : null,
    undated: dated.length < playedOns.length,
  };
}
