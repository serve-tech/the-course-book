import type { Course } from "@coursebook/domain/catalog/course";
import { FeedItemType, type FeedItem, type TimelineMonthCount, type TimelineRound } from "@coursebook/domain/social/types";

/**
 * Pure presentation rules for profiles, timelines and the feed: how dates,
 * visits, names and tile colors read. Kept out of the components so each
 * rule has one tested home.
 */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = MONTHS.map((month) => month.slice(0, 3));

/** Parts of an ISO date (YYYY-MM-DD) without time zone shifts. */
function dateParts(iso: string): { year: number; month: number; day: number } {
  const [year = 0, month = 1, day = 1] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

/** "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", ... */
export function ordinal(n: number): string {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return String(n) + suffix;
}

/** How a round's visit number reads: "First visit", "2nd round", ... */
export function visitLabel(visit: number): string {
  return visit <= 1 ? "First visit" : ordinal(visit) + " round";
}

/** "September 2026" for an ISO date. */
export function monthLabel(iso: string): string {
  const { year, month } = dateParts(iso);
  return (MONTHS[month - 1] ?? "") + " " + String(year);
}

/** "Sep 27" in the current year, "Sep 27, 2025" otherwise. */
export function shortDate(iso: string, now: Date): string {
  const { year, month, day } = dateParts(iso);
  const text = (SHORT_MONTHS[month - 1] ?? "") + " " + String(day);
  return year === now.getFullYear() ? text : text + ", " + String(year);
}

/**
 * When something happened, relative to `now`, by calendar day in the
 * viewer's time zone: "Today", "Yesterday", "3 days ago" within a week,
 * then a short date.
 */
export function relativeDay(at: string, now: Date): string {
  const then = new Date(at);
  const startOf = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(then)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return String(days) + " days ago";
  const local = [then.getFullYear(), then.getMonth() + 1, then.getDate()].map((part) => String(part).padStart(2, "0")).join("-");
  return shortDate(local, now);
}

/** The month key of rounds without a date. */
const UNDATED = "undated";

/** A month of the timeline; `key` is "YYYY-MM", or "undated" for rounds without a date. */
export interface TimelineMonth {
  key: string;
  label: string;
  /** The month's rounds loaded so far. */
  rounds: TimelineRound[];
  /** Every round the member logged that month, including ones on pages not loaded yet. */
  total: number;
}

/**
 * Group timeline rounds by month in the order given (the API sends newest
 * first, undated last). Consecutive rounds of one month share a group.
 *
 * @param rounds - The rounds loaded so far, in timeline order.
 * @param counts - The month counts from every page loaded. The API sends one
 *   for each month on a page, so a month cut off by a page shows its full
 *   total; a month without one falls back to the rounds loaded.
 */
export function groupByMonth(rounds: readonly TimelineRound[], counts: readonly TimelineMonthCount[]): TimelineMonth[] {
  const totals = new Map(counts.map((count) => [count.month ?? UNDATED, count.rounds]));
  const groups: Omit<TimelineMonth, "total">[] = [];
  for (const round of rounds) {
    const key = round.playedOn ? round.playedOn.slice(0, 7) : UNDATED;
    const last = groups.at(-1);
    if (last?.key === key) last.rounds.push(round);
    else groups.push({ key, label: round.playedOn ? monthLabel(round.playedOn) : "Date not recorded", rounds: [round] });
  }
  return groups.map((group) => ({ ...group, total: totals.get(group.key) ?? group.rounds.length }));
}

/** Day of the month for a timeline row, or an en dash for an undated round. */
export function dayOfMonth(playedOn: string | null): string {
  return playedOn ? String(dateParts(playedOn).day) : "–";
}

/** Up to two initials from a display name, falling back to the username. */
export function initials(displayName: string, username: string): string {
  const words = (displayName.trim() || username).split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? (words[0]?.[0] ?? "") + (words.at(-1)?.[0] ?? "") : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** Avatar background tones; one per member, stable across visits. */
export enum AvatarTone {
  Pine = "pine",
  Lake = "lake",
  Clay = "clay",
  Heather = "heather",
}

const AVATAR_TONES = Object.values(AvatarTone);

/** A stable tone for a username (case-insensitive). */
export function avatarTone(username: string): AvatarTone {
  let hash = 0;
  for (const character of username.toLowerCase()) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AvatarTone.Pine;
}

/** Tile colors, taken from the kind of ground a course sits on. */
export enum CourseTone {
  /** Links and heathland: Scotland, England, Wales, Ireland. */
  Heath = "heath",
  /** Coastal states and other countries. */
  Sea = "sea",
  /** Sandhills and the desert West. */
  Sand = "sand",
  /** Parkland and pines: everything else. */
  Pine = "pine",
}

const HEATH_COUNTRIES = /scotland|england|wales|ireland|united kingdom|^uk$/i;
const SEA_STATES = new Set(["CA", "OR", "WA", "HI", "NJ", "NY", "CT", "RI", "MA", "NH", "ME", "SC", "FL"]);
const SAND_STATES = new Set(["NE", "KS", "OK", "TX", "NM", "AZ", "NV", "UT", "CO", "ND", "SD", "WY", "MT", "ID"]);

/** The tile tone for a course, from its country and state. */
export function courseTone(course: Pick<Course, "country" | "state" | "location">): CourseTone {
  const country = course.country.trim();
  if (HEATH_COUNTRIES.test(country) || HEATH_COUNTRIES.test(course.location)) return CourseTone.Heath;
  if (country && country.toUpperCase() !== "USA") return CourseTone.Sea;
  const state = course.state.trim().toUpperCase();
  if (SAND_STATES.has(state)) return CourseTone.Sand;
  if (SEA_STATES.has(state)) return CourseTone.Sea;
  return CourseTone.Pine;
}

/** A short place line for tiles: "Mullen, NE", "St Andrews, Scotland". */
export function shortPlace(course: Pick<Course, "city" | "state" | "country">): string {
  const region = course.country.toUpperCase() === "USA" ? course.state : course.country;
  return [course.city, region].filter((part) => part.trim()).join(", ");
}

/** A round a friend logged, for the "New from friends" strip. */
export interface FriendPick {
  round: TimelineRound;
  member: FeedItem["member"];
}

/**
 * The newest friends' rounds for the strip at the top of Home: round items
 * only (not backfill), one per course, newest first.
 */
export function newFromFriends(items: readonly FeedItem[], limit: number): FriendPick[] {
  const picks: FriendPick[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (picks.length === limit) break;
    const round = item.rounds[0];
    if (item.type !== FeedItemType.Round || !round || seen.has(round.course.id)) continue;
    seen.add(round.course.id);
    picks.push({ round, member: item.member });
  }
  return picks;
}

/** "71%" for an agreement share. */
export function percent(share: number): string {
  return String(Math.round(share * 100)) + "%";
}

export interface FeedFirstPage {
  items: readonly FeedItem[];
  nextCursor: string | null;
}

/**
 * Keys that change whenever a loader returns a different first page, so
 * the paged view remounts and "Show more" starts over.
 */
export function timelineKey(username: string, first: { rounds: readonly TimelineRound[]; nextCursor: string | null }): string {
  return [username, first.rounds.length, first.rounds[0]?.id ?? "", first.nextCursor ?? ""].join(":");
}

export function feedKey(first: FeedFirstPage): string {
  return [first.items.length, first.items[0]?.id ?? "", first.nextCursor ?? ""].join(":");
}
