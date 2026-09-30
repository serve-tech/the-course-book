/**
 * An ISO date (YYYY-MM-DD) in the member's own time zone, so an evening
 * round is not dated tomorrow as it would be in UTC.
 *
 * Args:
 *     now: The moment to date. Defaults to the current time.
 */
export function localDate(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
