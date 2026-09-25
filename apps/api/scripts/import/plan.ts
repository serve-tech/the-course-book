/**
 * Pure planning for the Supabase -> Postgres data import. The script feeds
 * exported rows in and gets back exactly what to write; nothing here does
 * I/O, so the rules are unit-tested with plain data.
 */
import type { Course } from "@coursebook/domain/catalog/course";
import { equivalentCourses } from "../../src/domain/identity";
import { USERNAME_PATTERN } from "../../src/domain/username";

export interface ExportedProfile {
  id: string;
  email: string | null;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
}

export interface ExportedMembership {
  id: string;
  user_id: string;
  course_id: string;
  personal_rank: number | null;
  created_at: string | null;
  notes: string | null;
}

export interface ExportedRound {
  id: string;
  user_id: string;
  course_id: string;
  played_at: string | null;
  score: number | null;
  tees: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface MembershipPlan {
  /** Ordered course ids per Supabase user id, ranks 1..N by index. */
  order: Map<string, string[]>;
  /** Duplicate course id -> kept course id, per user, for re-pointing rounds. */
  merged: Map<string, Map<string, string>>;
  /** Courses that had rounds but no membership, appended at the bottom. */
  orphans: { userId: string; courseId: string }[];
}

/**
 * Decide each member's final order.
 *
 * Rules: sort memberships by rank (nulls last), then creation time, then id;
 * collapse memberships whose courses are equivalent by the identity rule
 * onto the first one; append courses that only have rounds.
 */
export function planMemberships(
  memberships: readonly ExportedMembership[],
  rounds: readonly ExportedRound[],
  courses: ReadonlyMap<string, Course>,
): MembershipPlan {
  const byUser = new Map<string, ExportedMembership[]>();
  for (const membership of memberships) {
    if (!courses.has(membership.course_id)) continue;
    const list = byUser.get(membership.user_id) ?? [];
    list.push(membership);
    byUser.set(membership.user_id, list);
  }
  const roundCourses = new Map<string, Set<string>>();
  for (const round of rounds) {
    if (!courses.has(round.course_id)) continue;
    const set = roundCourses.get(round.user_id) ?? new Set<string>();
    set.add(round.course_id);
    roundCourses.set(round.user_id, set);
  }

  const order = new Map<string, string[]>();
  const merged = new Map<string, Map<string, string>>();
  const orphans: { userId: string; courseId: string }[] = [];
  const userIds = new Set([...byUser.keys(), ...roundCourses.keys()]);

  for (const userId of userIds) {
    const sorted = [...(byUser.get(userId) ?? [])].sort(
      (a, b) =>
        (a.personal_rank ?? Number.MAX_SAFE_INTEGER) - (b.personal_rank ?? Number.MAX_SAFE_INTEGER) ||
        (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
        a.id.localeCompare(b.id),
    );
    const kept: string[] = [];
    const merges = new Map<string, string>();
    for (const membership of sorted) {
      const course = courses.get(membership.course_id);
      const duplicate = kept.find((id) => equivalentCourses(courses.get(id), course));
      if (duplicate && duplicate !== membership.course_id) merges.set(membership.course_id, duplicate);
      else if (!kept.includes(membership.course_id)) kept.push(membership.course_id);
    }
    for (const courseId of roundCourses.get(userId) ?? []) {
      const target = merges.get(courseId) ?? courseId;
      if (!kept.includes(target)) {
        kept.push(target);
        orphans.push({ userId, courseId: target });
      }
    }
    order.set(userId, kept);
    if (merges.size) merged.set(userId, merges);
  }
  return { order, merged, orphans };
}

/** Re-point rounds whose course was merged into another membership. */
export function remapRounds(
  rounds: readonly ExportedRound[],
  merged: ReadonlyMap<string, ReadonlyMap<string, string>>,
): ExportedRound[] {
  return rounds.map((round) => {
    const target = merged.get(round.user_id)?.get(round.course_id);
    return target ? { ...round, course_id: target } : round;
  });
}

/**
 * A username acceptable to the product rule, derived from the profile.
 * Invalid characters become underscores; the result is clamped to 24 and
 * padded to 3 characters. Collisions are resolved with a numeric suffix.
 */
export function usernameFor(profile: ExportedProfile, taken: ReadonlySet<string>): string {
  const raw = (profile.username || profile.display_name || profile.email?.split("@")[0] || "member").trim();
  let base = raw.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  if (base.length < 3) base = (base + "___").slice(0, 3);
  let candidate = base;
  for (let n = 2; taken.has(candidate.toLowerCase()) || !USERNAME_PATTERN.test(candidate); n++) {
    const suffix = String(n);
    candidate = base.slice(0, 24 - suffix.length) + suffix;
  }
  return candidate;
}
