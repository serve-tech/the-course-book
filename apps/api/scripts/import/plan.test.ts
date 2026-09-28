import { describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import {
  assignUsernames,
  planImport,
  planMemberships,
  remapRounds,
  summarizeLedger,
  usernameFor,
  type PlannedMember,
} from "./plan";
import type { AuthUserRow, CourseRow, MembershipRow, ProfileRow, RoundRow, SupabaseExport } from "./rows";

const course = (id: string, name: string, location = "Detroit, MI, USA") => courseSchema.parse({ id, name, location });

const catalog = new Map([
  ["a", course("a", "Alpha Links")],
  ["a2", course("a2", "Alpha Links Golf Club")],
  ["b", course("b", "Beta Links")],
  ["c", course("c", "Gamma Links")],
]);

// A syntactically valid bcrypt digest (not a real password's).
const BCRYPT = "$2a$10$" + "abcdefghijklmnopqrstuv".repeat(2).slice(0, 22) + "ABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

const auth = (id: string, email: string | null, encrypted_password: string | null = null): AuthUserRow => ({ id, email, encrypted_password });
const profile = (id: string, overrides: Partial<ProfileRow> = {}): ProfileRow => ({
  id,
  email: null,
  username: null,
  display_name: null,
  avatar_url: null,
  ...overrides,
});
const exportedCourse = (id: string, name: string, overrides: Partial<CourseRow> = {}): CourseRow => ({
  id,
  name,
  city: "Hometown",
  state: "OH",
  country: "USA",
  logo_url: null,
  website_url: null,
  is_custom: true,
  created_at: null,
  ...overrides,
});
const membership = (id: string, user_id: string | null, course_id: string | null, overrides: Partial<MembershipRow> = {}): MembershipRow => ({
  id,
  user_id,
  course_id,
  personal_rank: null,
  times_played: null,
  created_at: null,
  notes: null,
  ...overrides,
});
const round = (id: string, user_id: string | null, course_id: string | null, overrides: Partial<RoundRow> = {}): RoundRow => ({
  id,
  user_id,
  course_id,
  played_at: "2026-01-01",
  score: null,
  tees: null,
  notes: null,
  created_at: null,
  ...overrides,
});
const exported = (overrides: Partial<SupabaseExport>): SupabaseExport => ({
  authUsers: [],
  profiles: [],
  courses: [],
  memberships: [],
  rounds: [],
  ...overrides,
});

describe("membership planning", () => {
  const placed = (id: string, course_id: string, personal_rank: number | null, created_at: string | null = null) => ({
    id,
    user_id: "u1",
    course_id,
    personal_rank,
    created_at,
  });

  it("orders by rank with nulls last, then creation time", () => {
    const plan = planMemberships([placed("m1", "b", null, "2026-01-02"), placed("m2", "a", 2), placed("m3", "c", 1)], [], catalog);
    expect(plan.order.get("u1")).toEqual(["c", "a", "b"]);
    expect(plan.orphans).toEqual([]);
  });

  it("collapses equivalent duplicate courses and re-points their rounds", () => {
    const plan = planMemberships([placed("m1", "a", 1), placed("m2", "a2", 2), placed("m3", "b", 3)], [{ user_id: "u1", course_id: "a2" }], catalog);
    expect(plan.order.get("u1")).toEqual(["a", "b"]);
    expect(plan.merged.get("u1")?.get("a2")).toBe("a");
    expect(remapRounds([{ id: "r1", user_id: "u1", course_id: "a2" }], plan.merged)[0]?.course_id).toBe("a");
  });

  it("appends courses that only have rounds", () => {
    const plan = planMemberships([placed("m1", "b", 1)], [{ user_id: "u1", course_id: "c" }], catalog);
    expect(plan.order.get("u1")).toEqual(["b", "c"]);
    expect(plan.orphans).toEqual([{ userId: "u1", courseId: "c" }]);
  });

  it("plans a user who only has rounds", () => {
    expect(planMemberships([], [{ user_id: "u9", course_id: "a" }], catalog).order.get("u9")).toEqual(["a"]);
  });

  it("refuses an unknown course instead of skipping it", () => {
    expect(() => planMemberships([], [{ user_id: "u1", course_id: "missing" }], catalog)).toThrow(/unknown course missing/);
  });
});

describe("import planning", () => {
  const data = exported({
    authUsers: [auth("u1", "one@example.com", BCRYPT), auth("u2", "two@example.com", null), auth("u3", "three@example.com")],
    profiles: [profile("u1", { username: "golfer" }), profile("u2", { display_name: "Bee Golfer" }), profile("u3")],
    courses: [exportedCourse("a", "Alpha Links", { is_custom: false }), exportedCourse("custom1", "Backyard Nine")],
    memberships: [
      membership("m1", "u1", "a", { personal_rank: 1, times_played: 2 }),
      membership("m2", "u1", "a2", { personal_rank: 2, notes: "played it in the rain" }),
      membership("m3", "u1", "custom1", { personal_rank: 3 }),
      membership("m4", "u2", "b", { personal_rank: 1, times_played: 5 }),
    ],
    rounds: [
      round("r1", "u1", "a"),
      round("r2", "u1", "a2"),
      round("r3", "u1", "c"),
      round("r4", "u2", "b", { played_at: null, created_at: "2026-03-04 10:00:00+00" }),
    ],
  });

  it("accounts for every exported row exactly once", () => {
    const plan = planImport(data, catalog);
    expect(plan.problems).toEqual([]);
    expect(plan.ledger).toHaveLength(3 + 3 + 2 + 4 + 4);
    const summary = summarizeLedger(plan.ledger);
    expect(Object.fromEntries(summary.get("courses") ?? [])).toEqual({ in_catalog: 1, imported: 1 });
    expect(Object.fromEntries(summary.get("user_courses") ?? [])).toEqual({ imported: 3, merged: 1 });
    expect(Object.fromEntries(summary.get("rounds") ?? [])).toEqual({ imported: 3, moved: 1 });
    expect(plan.ledger.find((entry) => entry.id === "m2")?.outcome).toEqual({ kind: "merged", into: "a" });
    expect(plan.ledger.find((entry) => entry.id === "r2")?.outcome).toEqual({ kind: "moved", to: "a" });
  });

  it("keeps every round, merged entries' notes and courses that only had rounds", () => {
    const plan = planImport(data, catalog);
    expect(plan.lists.get("u1")).toEqual([
      { courseId: "a", rank: 1, notes: "played it in the rain" },
      { courseId: "custom1", rank: 2, notes: null },
      { courseId: "c", rank: 3, notes: null },
    ]);
    expect(plan.rounds.get("u1")?.map((entry) => [entry.id, entry.courseId])).toEqual([
      ["r1", "a"],
      ["r2", "a"],
      ["r3", "c"],
    ]);
    expect(plan.rounds.get("u2")?.[0]?.playedOn).toBe("2026-03-04");
    expect(plan.newCourses.map((row) => row.id)).toEqual(["custom1"]);
  });

  it("imports every member, with their bcrypt digest when they have one", () => {
    const plan = planImport(data, catalog);
    expect(plan.members.map((member) => [member.supabaseId, member.email, member.displayName, member.passwordDigest])).toEqual([
      ["u1", "one@example.com", "golfer", BCRYPT],
      ["u2", "two@example.com", "Bee Golfer", null],
      ["u3", "three@example.com", "three", null],
    ]);
  });

  it("reports stored counts that differ from rounds and rounds dated from creation", () => {
    const { notices } = planImport(data, catalog);
    expect(notices).toContain("1 rounds have no played_at and are dated from created_at");
    expect(notices).toContain(
      "2 list entries have a stored times_played that differs from their rounds; the old app showed round counts, which are imported",
    );
  });

  it("gives a non-bcrypt hash no digest and says so", () => {
    const plan = planImport(exported({ authUsers: [auth("u1", "one@example.com", "md5:abc")] }), catalog);
    expect(plan.members[0]?.passwordDigest).toBeNull();
    expect(plan.notices[0]).toMatch(/not bcrypt/);
    expect(plan.notices.join()).not.toContain("md5:abc");
  });

  it.each<[string, Partial<SupabaseExport>, RegExp]>([
    ["a list entry without a course", { memberships: [membership("m1", "u1", null)] }, /user_courses m1: has no course_id/],
    ["a list entry for an unknown course", { memberships: [membership("m1", "u1", "nowhere")] }, /names course nowhere/],
    ["a round for an unknown member", { rounds: [round("r1", "ghost", "a")] }, /rounds r1: belongs to ghost/],
    ["a round without any date", { rounds: [round("r1", "u1", "a", { played_at: null, created_at: null })] }, /neither played_at nor created_at/],
  ])("stops on %s", (_label, rows, message) => {
    const plan = planImport(exported({ authUsers: [auth("u1", "one@example.com")], ...rows }), catalog);
    expect(plan.problems.join("\n")).toMatch(message);
    expect(plan.ledger.filter((entry) => entry.outcome.kind === "problem")).toHaveLength(1);
  });

  it("stops on a member without an email, and on every row that belongs to them", () => {
    const plan = planImport(
      exported({ authUsers: [auth("u1", null)], profiles: [profile("u1", { email: "  " })], rounds: [round("r1", "u1", "a")] }),
      catalog,
    );
    expect(plan.problems).toHaveLength(3);
    expect(plan.problems[0]).toMatch(/auth_users u1: member u1 has no email address/);
    expect(plan.members).toEqual([]);
  });

  it("stops on two members sharing an email address", () => {
    const plan = planImport(exported({ authUsers: [auth("u1", "same@example.com"), auth("u2", "SAME@example.com")] }), catalog);
    expect(plan.problems).toEqual([
      "auth_users u1: member u1 shares its email address with u2",
      "auth_users u2: member u2 shares its email address with u1",
    ]);
  });

  it("takes the email from the profile when auth has none", () => {
    const plan = planImport(exported({ profiles: [profile("u1", { email: "p@example.com" })] }), catalog);
    expect(plan.members[0]?.email).toBe("p@example.com");
    expect(plan.notices).toContain("member u1: no auth.users row; imported from the profile without a password");
  });
});

describe("username derivation", () => {
  const source = (username: string | null, display_name: string | null = null, email: string | null = null) => ({ username, display_name, email });

  it("keeps valid usernames and sanitizes invalid ones", () => {
    expect(usernameFor(source("golfer_1"), new Set())).toBe("golfer_1");
    expect(usernameFor(source("bad name!"), new Set())).toBe("bad_name");
    expect(usernameFor(source(null, "Jo"), new Set())).toBe("Jo_");
    expect(usernameFor(source(null, null, "someone@example.com"), new Set())).toBe("someone");
    expect(usernameFor(source("x".repeat(30)), new Set())).toHaveLength(24);
  });

  it("adds a numeric suffix on collision", () => {
    expect(usernameFor(source("golfer"), new Set(["golfer"]))).toBe("golfer2");
    expect(usernameFor(source("golfer"), new Set(["golfer", "golfer2"]))).toBe("golfer3");
  });

  it("keeps an existing account's username and derives the rest around it", () => {
    const member = (supabaseId: string, username: string): PlannedMember => ({
      supabaseId,
      email: supabaseId + "@example.com",
      displayName: username,
      avatarUrl: null,
      usernameSource: source(username),
      passwordDigest: null,
    });
    const usernames = assignUsernames([member("u1", "golfer"), member("u2", "golfer")], new Map([["u2", "golfer"]]), new Set(["taken"]));
    expect(Object.fromEntries(usernames)).toEqual({ u1: "golfer2", u2: "golfer" });
  });
});
