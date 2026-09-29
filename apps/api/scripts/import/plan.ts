/**
 * Pure planning for the Supabase -> Postgres member import. The script feeds
 * validated export rows in (rows.ts) and gets back exactly what to write,
 * plus a ledger that gives every source row exactly one outcome. Nothing here
 * does I/O, so the rules are unit-tested with plain data.
 *
 * The import is 1-for-1 (maintainer decision, 2026-09-28): every list entry
 * and round keeps its own course, and nothing is merged or corrected, even
 * where the old data is wrong. Only what the new schema forces changes, and
 * the report says so: ranks are renumbered 1..N in their existing order, and
 * a course with rounds but no list entry gets one at the bottom.
 *
 * Nothing is dropped silently: a row the plan cannot place is a problem, and
 * any problem stops the import before it writes (run.ts).
 */
import { USERNAME_PATTERN } from "../../src/domain/username";
import type { CourseRow, MembershipRow, ProfileRow, RoundRow, SupabaseExport } from "./rows";

/** Supabase Auth stores bcrypt digests; Clerk imports them with `passwordHasher: "bcrypt"`. */
const BCRYPT_DIGEST = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

type WithOwner = { user_id: string; course_id: string };
/** A membership whose member and course are both known. */
export type PlacedMembership = MembershipRow & WithOwner;
/** A round whose member and course are known, with its played date resolved. */
export type PlacedRound = RoundRow & WithOwner & { played_on: string };

export interface MembershipPlan {
  /** Ordered course ids per Supabase user id, ranks 1..N by index. */
  order: Map<string, string[]>;
  /** Courses that had rounds but no membership, appended at the bottom. */
  orphans: { userId: string; courseId: string }[];
}

/**
 * Decide each member's final order.
 *
 * Every membership keeps its own course. Order: rank (nulls last), then
 * creation time, then id, renumbered 1..N; courses that only have rounds are
 * appended at the bottom, as the old app showed them.
 *
 * Raises:
 *     Error: A membership or round names a course missing from `courseIds`;
 *         `planImport` reports those as problems before calling this.
 */
export function planMemberships(
  memberships: readonly Pick<MembershipRow & WithOwner, "id" | "user_id" | "course_id" | "personal_rank" | "created_at">[],
  rounds: readonly WithOwner[],
  courseIds: ReadonlySet<string>,
): MembershipPlan {
  const known = (courseId: string) => {
    if (!courseIds.has(courseId)) throw new Error(`planMemberships: unknown course ${courseId}`);
  };
  const byUser = new Map<string, (typeof memberships)[number][]>();
  for (const membership of memberships) {
    known(membership.course_id);
    byUser.set(membership.user_id, [...(byUser.get(membership.user_id) ?? []), membership]);
  }
  const roundCourses = new Map<string, Set<string>>();
  for (const round of rounds) {
    known(round.course_id);
    const set = roundCourses.get(round.user_id) ?? new Set<string>();
    set.add(round.course_id);
    roundCourses.set(round.user_id, set);
  }

  const order = new Map<string, string[]>();
  const orphans: { userId: string; courseId: string }[] = [];
  for (const userId of new Set([...byUser.keys(), ...roundCourses.keys()])) {
    const kept = [...(byUser.get(userId) ?? [])]
      .sort(
        (a, b) =>
          (a.personal_rank ?? Number.MAX_SAFE_INTEGER) - (b.personal_rank ?? Number.MAX_SAFE_INTEGER) ||
          (a.created_at ?? "").localeCompare(b.created_at ?? "") ||
          a.id.localeCompare(b.id),
      )
      .map((membership) => membership.course_id);
    for (const courseId of roundCourses.get(userId) ?? []) {
      if (!kept.includes(courseId)) {
        kept.push(courseId);
        orphans.push({ userId, courseId });
      }
    }
    order.set(userId, kept);
  }
  return { order, orphans };
}

/**
 * A username acceptable to the product rule, derived from the profile.
 * Invalid characters become underscores; the result is clamped to 24 and
 * padded to 3 characters. Collisions are resolved with a numeric suffix.
 */
export function usernameFor(profile: Pick<ProfileRow, "username" | "display_name" | "email">, taken: ReadonlySet<string>): string {
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

export type ImportTable = "auth_users" | "profiles" | "courses" | "user_courses" | "rounds";

/** What happened to one source row. */
export type Outcome =
  | { kind: "imported" }
  /** A course the new catalog already has. */
  | { kind: "in_catalog" }
  | { kind: "problem"; reason: string };

export interface LedgerEntry {
  table: ImportTable;
  id: string;
  outcome: Outcome;
}

export interface PlannedMember {
  supabaseId: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  /** The old username, display name and email, for deriving a username. */
  usernameSource: Pick<ProfileRow, "username" | "display_name" | "email">;
  /** Supabase Auth's bcrypt digest; null for members without a password (Google sign-in). */
  passwordDigest: string | null;
}

export interface PlannedEntry {
  courseId: string;
  rank: number;
  notes: string | null;
}

export interface PlannedRound {
  id: string;
  courseId: string;
  playedOn: string;
  score: number | null;
  tees: string | null;
  notes: string | null;
  createdAt: string | null;
}

export interface ImportPlan {
  members: PlannedMember[];
  /** Exported courses the database lacks, inserted with their original ids. */
  newCourses: CourseRow[];
  /** Each member's list in rank order, by Supabase user id. */
  lists: Map<string, PlannedEntry[]>;
  /** Each member's rounds, by Supabase user id. */
  rounds: Map<string, PlannedRound[]>;
  /** Exactly one entry per exported row. */
  ledger: LedgerEntry[];
  /** Rows the plan cannot place; any problem stops the import. */
  problems: string[];
  /** Facts worth reading that do not stop the import. */
  notices: string[];
}

const utcDate = (timestamp: string) => new Date(timestamp).toISOString().slice(0, 10);

/**
 * Plan the whole import and account for every exported row.
 *
 * Members are the union of `auth.users` and `profiles`; the auth email wins.
 * A member without an email, or sharing one with another member, cannot get a
 * Clerk account, so their rows are problems. Exported courses the catalog
 * lacks are inserted. List entries and rounds need a known member and course,
 * and keep it (1-for-1); two list entries for the same member and course
 * cannot both exist in the new schema, so that is a problem. A round without
 * `played_at` is dated from its creation time. The old app showed play
 * counts from rounds, never `times_played`, so a mismatch is a notice.
 *
 * Args:
 *     data: The validated export.
 *     catalogIds: Ids of the courses already in the database.
 *
 * Returns:
 *     What to write, the ledger, problems and notices.
 *
 * Raises:
 *     Error: The ledger does not hold exactly one entry per exported row
 *         (a bug in this function, never a data condition).
 */
export function planImport(data: SupabaseExport, catalogIds: ReadonlySet<string>): ImportPlan {
  const ledger: LedgerEntry[] = [];
  const problems: string[] = [];
  const notices: string[] = [];
  const record = (table: ImportTable, id: string, outcome: Outcome) => {
    ledger.push({ table, id, outcome });
    if (outcome.kind === "problem") problems.push(`${table} ${id}: ${outcome.reason}`);
  };

  // Members.
  const authById = new Map(data.authUsers.map((row) => [row.id, row]));
  const profileById = new Map(data.profiles.map((row) => [row.id, row]));
  const memberIds = [...new Set([...authById.keys(), ...profileById.keys()])];
  const emailOf = (memberId: string) =>
    (authById.get(memberId)?.email ?? profileById.get(memberId)?.email)?.trim() || null;
  const holders = new Map<string, string[]>();
  for (const memberId of memberIds) {
    const email = emailOf(memberId)?.toLowerCase();
    if (email) holders.set(email, [...(holders.get(email) ?? []), memberId]);
  }
  const unplaceable = new Map<string, string>();
  for (const memberId of memberIds) {
    const email = emailOf(memberId);
    if (!email) unplaceable.set(memberId, "has no email address in auth.users or profiles");
    else {
      const sharing = (holders.get(email.toLowerCase()) ?? []).filter((other) => other !== memberId);
      if (sharing.length) unplaceable.set(memberId, `shares its email address with ${sharing.join(", ")}`);
    }
  }
  const members: PlannedMember[] = [];
  for (const memberId of memberIds) {
    if (unplaceable.has(memberId)) continue;
    const auth = authById.get(memberId);
    const profile = profileById.get(memberId);
    const email = emailOf(memberId) ?? "";
    const hash = auth?.encrypted_password ?? null;
    const passwordDigest = hash && BCRYPT_DIGEST.test(hash) ? hash : null;
    if (hash && !passwordDigest) notices.push(`member ${memberId}: password hash is not bcrypt, so they sign in with Google or reset their password`);
    if (!auth) notices.push(`member ${memberId}: no auth.users row; imported from the profile without a password`);
    members.push({
      supabaseId: memberId,
      email,
      displayName: profile?.display_name?.trim() || profile?.username?.trim() || email.split("@")[0] || "Member",
      avatarUrl: profile?.avatar_url ?? null,
      usernameSource: { username: profile?.username ?? null, display_name: profile?.display_name ?? null, email },
      passwordDigest,
    });
  }
  const memberProblem = (memberId: string) => {
    const reason = unplaceable.get(memberId);
    return reason ? `member ${memberId} ${reason}` : null;
  };
  for (const row of data.authUsers) {
    const reason = memberProblem(row.id);
    record("auth_users", row.id, reason ? { kind: "problem", reason } : { kind: "imported" });
  }
  for (const row of data.profiles) {
    const reason = memberProblem(row.id);
    record("profiles", row.id, reason ? { kind: "problem", reason } : { kind: "imported" });
  }

  // Courses.
  const courses = new Set(catalogIds);
  const newCourses: CourseRow[] = [];
  for (const row of data.courses) {
    if (catalogIds.has(row.id)) {
      record("courses", row.id, { kind: "in_catalog" });
    } else {
      newCourses.push(row);
      courses.add(row.id);
      record("courses", row.id, { kind: "imported" });
    }
  }

  const placementProblem = (row: { user_id: string | null; course_id: string | null }) => {
    if (!row.user_id) return "has no user_id";
    if (!memberIds.includes(row.user_id)) return `belongs to ${row.user_id}, who is in neither auth.users nor profiles`;
    const member = memberProblem(row.user_id);
    if (member) return `belongs to ${member}`;
    if (!row.course_id) return "has no course_id";
    if (!courses.has(row.course_id)) return `names course ${row.course_id}, which is in neither courses.csv nor the catalog`;
    return null;
  };

  // List entries and rounds: place what can be placed, record the rest.
  const placedMemberships: PlacedMembership[] = [];
  const membershipProblems = new Map<string, string>();
  const entryOwner = new Map<string, string>();
  for (const row of data.memberships) {
    const reason = placementProblem(row);
    const key = `${row.user_id ?? ""}|${row.course_id ?? ""}`;
    const earlier = entryOwner.get(key);
    if (reason || !row.user_id || !row.course_id) membershipProblems.set(row.id, reason ?? "cannot be placed");
    else if (earlier) membershipProblems.set(row.id, `repeats list entry ${earlier} for the same member and course`);
    else {
      entryOwner.set(key, row.id);
      placedMemberships.push({ ...row, user_id: row.user_id, course_id: row.course_id });
    }
  }
  const placedRounds: PlacedRound[] = [];
  const roundProblems = new Map<string, string>();
  let datedFromCreation = 0;
  for (const row of data.rounds) {
    const reason = placementProblem(row);
    const playedOn = row.played_at ?? (row.created_at ? utcDate(row.created_at) : null);
    if (reason || !row.user_id || !row.course_id) roundProblems.set(row.id, reason ?? "cannot be placed");
    else if (!playedOn) roundProblems.set(row.id, "has neither played_at nor created_at");
    else {
      if (!row.played_at) datedFromCreation++;
      placedRounds.push({ ...row, user_id: row.user_id, course_id: row.course_id, played_on: playedOn });
    }
  }
  if (datedFromCreation) notices.push(`${String(datedFromCreation)} rounds have no played_at and are dated from created_at`);

  const plan = planMemberships(placedMemberships, placedRounds, courses);

  // Ledger for list entries; each keeps its course and notes.
  for (const row of data.memberships) {
    const reason = membershipProblems.get(row.id);
    record("user_courses", row.id, reason ? { kind: "problem", reason } : { kind: "imported" });
  }
  const placedByEntry = new Map(placedMemberships.map((membership) => [`${membership.user_id}|${membership.course_id}`, membership]));
  const lists = new Map<string, PlannedEntry[]>();
  let renumbered = 0;
  for (const [userId, order] of plan.order) {
    const entries = order.map((courseId, index) => ({
      courseId,
      rank: index + 1,
      notes: placedByEntry.get(`${userId}|${courseId}`)?.notes ?? null,
    }));
    if (entries.some((entry) => placedByEntry.get(`${userId}|${entry.courseId}`)?.personal_rank !== entry.rank)) renumbered++;
    lists.set(userId, entries);
  }
  if (plan.orphans.length)
    notices.push(`${String(plan.orphans.length)} list entries added at the bottom for courses that have rounds but no list entry (the new schema requires one; the old app showed them there)`);
  if (renumbered)
    notices.push(`${String(renumbered)} members' ranks renumbered 1..N in their existing order (the old data had duplicate, missing or skipped ranks, or courses with only rounds)`);

  // Ledger for rounds.
  const rounds = new Map<string, PlannedRound[]>();
  const placedRoundById = new Map(placedRounds.map((round) => [round.id, round]));
  for (const row of data.rounds) {
    const round = placedRoundById.get(row.id);
    if (!round) {
      record("rounds", row.id, { kind: "problem", reason: roundProblems.get(row.id) ?? "cannot be placed" });
      continue;
    }
    record("rounds", row.id, { kind: "imported" });
    rounds.set(round.user_id, [
      ...(rounds.get(round.user_id) ?? []),
      {
        id: round.id,
        courseId: round.course_id,
        playedOn: round.played_on,
        score: round.score,
        tees: round.tees,
        notes: round.notes,
        createdAt: round.created_at,
      },
    ]);
  }

  // The old app never displayed times_played; report where it disagrees with the rounds.
  const roundCount = new Map<string, number>();
  for (const round of placedRounds) {
    const key = `${round.user_id}|${round.course_id}`;
    roundCount.set(key, (roundCount.get(key) ?? 0) + 1);
  }
  const stale = placedMemberships.filter(
    (row) => row.times_played !== null && row.times_played !== (roundCount.get(`${row.user_id}|${row.course_id}`) ?? 0),
  );
  if (stale.length) notices.push(`${String(stale.length)} list entries have a stored times_played that differs from their rounds; the old app showed round counts, which are imported`);

  const sources: Record<ImportTable, number> = {
    auth_users: data.authUsers.length,
    profiles: data.profiles.length,
    courses: data.courses.length,
    user_courses: data.memberships.length,
    rounds: data.rounds.length,
  };
  for (const [table, count] of Object.entries(sources)) {
    const accounted = ledger.filter((entry) => entry.table === table).length;
    if (accounted !== count) throw new Error(`planImport: ${table} has ${String(count)} rows but ${String(accounted)} ledger entries`);
  }

  return { members, newCourses, lists, rounds, ledger, problems, notices };
}

/**
 * Choose each member's username. An existing Clerk account keeps its own;
 * everyone else gets one derived from their old profile, unique among the
 * database's other users, the existing accounts and this import.
 *
 * Args:
 *     members: Planned members in import order.
 *     existing: Username of the Clerk account found for a Supabase id (null
 *         when that account has none).
 *     taken: Lowercased usernames of database users outside this import.
 */
export function assignUsernames(
  members: readonly PlannedMember[],
  existing: ReadonlyMap<string, string | null>,
  taken: ReadonlySet<string>,
): Map<string, string> {
  const used = new Set(taken);
  const usernames = new Map<string, string>();
  for (const member of members) {
    const kept = existing.get(member.supabaseId);
    if (kept) {
      usernames.set(member.supabaseId, kept);
      used.add(kept.toLowerCase());
    }
  }
  for (const member of members) {
    if (usernames.has(member.supabaseId)) continue;
    const username = usernameFor(member.usernameSource, used);
    usernames.set(member.supabaseId, username);
    used.add(username.toLowerCase());
  }
  return usernames;
}

/** Row counts per table and outcome, for the report. */
export function summarizeLedger(ledger: readonly LedgerEntry[]): Map<ImportTable, Map<Outcome["kind"], number>> {
  const summary = new Map<ImportTable, Map<Outcome["kind"], number>>();
  for (const entry of ledger) {
    const counts = summary.get(entry.table) ?? new Map<Outcome["kind"], number>();
    counts.set(entry.outcome.kind, (counts.get(entry.outcome.kind) ?? 0) + 1);
    summary.set(entry.table, counts);
  }
  return summary;
}
