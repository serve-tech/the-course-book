import { describe, expect, it } from "vitest";
import { courseSchema } from "../../app/features/catalog/course";
import { planMemberships, remapRounds, usernameFor, type ExportedMembership, type ExportedRound } from "./plan";

const course = (id: string, name: string, location = "Detroit, MI, USA") =>
  courseSchema.parse({ id, name, location });

const courses = new Map([
  ["a", course("a", "Alpha Links")],
  ["a2", course("a2", "Alpha Links Golf Club")],
  ["b", course("b", "Beta Links")],
  ["c", course("c", "Gamma Links")],
]);

const membership = (overrides: Partial<ExportedMembership> & Pick<ExportedMembership, "id" | "course_id">): ExportedMembership => ({
  user_id: "u1",
  personal_rank: null,
  created_at: null,
  notes: null,
  ...overrides,
});

const round = (id: string, course_id: string, user_id = "u1"): ExportedRound => ({
  id,
  user_id,
  course_id,
  played_at: "2026-01-01",
  score: null,
  tees: null,
  notes: null,
  created_at: null,
});

describe("membership planning", () => {
  it("orders by rank with nulls last, then creation time", () => {
    const plan = planMemberships(
      [
        membership({ id: "m1", course_id: "b", personal_rank: null, created_at: "2026-01-02" }),
        membership({ id: "m2", course_id: "a", personal_rank: 2 }),
        membership({ id: "m3", course_id: "c", personal_rank: 1 }),
      ],
      [],
      courses,
    );
    expect(plan.order.get("u1")).toEqual(["c", "a", "b"]);
    expect(plan.orphans).toEqual([]);
  });

  it("collapses equivalent duplicate courses and re-points their rounds", () => {
    const plan = planMemberships(
      [
        membership({ id: "m1", course_id: "a", personal_rank: 1 }),
        membership({ id: "m2", course_id: "a2", personal_rank: 2 }),
        membership({ id: "m3", course_id: "b", personal_rank: 3 }),
      ],
      [round("r1", "a2")],
      courses,
    );
    expect(plan.order.get("u1")).toEqual(["a", "b"]);
    expect(plan.merged.get("u1")?.get("a2")).toBe("a");
    expect(remapRounds([round("r1", "a2")], plan.merged)[0]?.course_id).toBe("a");
  });

  it("appends courses that only have rounds and skips unknown courses", () => {
    const plan = planMemberships(
      [membership({ id: "m1", course_id: "b", personal_rank: 1 })],
      [round("r1", "c"), round("r2", "missing")],
      courses,
    );
    expect(plan.order.get("u1")).toEqual(["b", "c"]);
    expect(plan.orphans).toEqual([{ userId: "u1", courseId: "c" }]);
  });

  it("plans a user who only has rounds", () => {
    const plan = planMemberships([], [round("r1", "a", "u9")], courses);
    expect(plan.order.get("u9")).toEqual(["a"]);
  });
});

describe("username derivation", () => {
  const profile = (username: string | null, display_name: string | null = null, email: string | null = null) => ({
    id: "p",
    username,
    display_name,
    avatar_url: null,
    email,
  });

  it("keeps valid usernames and sanitizes invalid ones", () => {
    expect(usernameFor(profile("golfer_1"), new Set())).toBe("golfer_1");
    expect(usernameFor(profile("bad name!"), new Set())).toBe("bad_name");
    expect(usernameFor(profile(null, "Jo"), new Set())).toBe("Jo_");
    expect(usernameFor(profile(null, null, "someone@example.com"), new Set())).toBe("someone");
    expect(usernameFor(profile("x".repeat(30)), new Set())).toHaveLength(24);
  });

  it("adds a numeric suffix on collision", () => {
    expect(usernameFor(profile("golfer"), new Set(["golfer"]))).toBe("golfer2");
    expect(usernameFor(profile("golfer"), new Set(["golfer", "golfer2"]))).toBe("golfer3");
  });
});
