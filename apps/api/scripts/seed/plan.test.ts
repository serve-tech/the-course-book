import { describe, expect, it } from "vitest";
import { courseSchema, type Course } from "@coursebook/domain/catalog/course";
import { FriendshipStatus } from "../../src/domain/friendship";
import { BACKFILL_DAYS } from "../../src/services/feed";
import { PERSONAS, SeedRelation, YOU, type GolferSpec, type PersonaSpec } from "./personas";
import { planSeed, prestige, randomFor, seedId, summarizePlan, type SeedJournal, type SeedPlan } from "./plan";

const NOW = new Date("2026-09-30T15:00:00Z");
const DAY_MS = 86_400_000;
const YOU_ID = "user_you";

let nextId = 0;
const course = (name: string, fields: Partial<Course> = {}): Course =>
  courseSchema.parse({ id: `course-${String(++nextId)}`, name, location: "", ...fields });

/** Every course the committed specs name, unranked, plus 60 ranked courses on each filler state's list. */
function catalogFor(golfers: readonly GolferSpec[]): Course[] {
  const names = new Set(
    golfers.flatMap((golfer) => [
      ...(golfer.home ? [golfer.home.course] : []),
      ...golfer.courses,
      ...golfer.trips.flatMap((trip) => trip.days.flat()),
      ...golfer.recent.map((round) => round.course),
    ]),
  );
  const states = new Set(golfers.flatMap((golfer) => golfer.filler?.states ?? []));
  return [
    ...[...names].map((name) => course(name)),
    ...[...states].flatMap((state) =>
      Array.from({ length: 60 }, (_, index) => course(`${state} Ranked ${String(index + 1)}`, { state, stateRank: index + 1 })),
    ),
  ];
}

const committedCatalog = catalogFor([YOU, ...PERSONAS]);
const plan = planSeed({ catalog: committedCatalog, youId: YOU_ID, now: NOW, includeYou: true });
const journal = (userId: string): SeedJournal => {
  const found = plan.journals.find((entry) => entry.userId === userId);
  if (!found) throw new Error(`no journal for ${userId}`);
  return found;
};
const daysLate = (createdAt: Date, playedOn: string) =>
  Math.round((Date.parse(createdAt.toISOString().slice(0, 10)) - Date.parse(playedOn)) / DAY_MS);
const isoDaysAgo = (daysAgo: number) => new Date(Date.parse("2026-09-30") - daysAgo * DAY_MS).toISOString().slice(0, 10);

/** A minimal golfer for focused cases. */
const golfer = (fields: Partial<GolferSpec>): GolferSpec => ({
  home: null,
  courses: [],
  filler: null,
  trips: [],
  recent: [],
  historyDays: 400,
  seasonal: false,
  backfillDaysAgo: null,
  ...fields,
});
const persona = (key: string, fields: Partial<PersonaSpec> = {}): PersonaSpec => ({
  ...golfer({ courses: ["Alpha Links"] }),
  key,
  username: key + "_golfer",
  displayName: key,
  joinedDaysAgo: 500,
  relation: SeedRelation.Friend,
  sinceDaysAgo: 100,
  friendsWith: [],
  ...fields,
});

describe("planSeed with the committed personas", () => {
  it("gives every member contiguous ranks, a round on every listed course and no round off the list", () => {
    for (const entry of plan.journals) {
      expect(new Set(entry.courseIds).size).toBe(entry.courseIds.length);
      expect(new Set(entry.rounds.map((round) => round.courseId))).toEqual(new Set(entry.courseIds));
    }
  });

  it("logs nothing in the future and nothing before the day it was played", () => {
    for (const round of plan.journals.flatMap((entry) => entry.rounds)) {
      expect(round.createdAt.getTime()).toBeLessThan(NOW.getTime());
      expect(round.playedOn < "2026-09-30").toBe(true);
      expect(daysLate(round.createdAt, round.playedOn)).toBeGreaterThanOrEqual(0);
    }
  });

  it("never logs a seeded member's round before they joined", () => {
    for (const member of plan.members)
      for (const round of journal(member.id).rounds) expect(round.createdAt.getTime()).toBeGreaterThan(member.createdAt.getTime());
  });

  it("gives every friend of yours fresh activity from the last two weeks", () => {
    const friends = PERSONAS.filter((spec) => spec.relation === SeedRelation.Friend);
    expect(friends.length).toBeGreaterThanOrEqual(3);
    for (const friend of friends) {
      const fresh = journal(seedId(friend.key)).rounds.filter(
        (round) => NOW.getTime() - round.createdAt.getTime() < 14 * DAY_MS && daysLate(round.createdAt, round.playedOn) <= BACKFILL_DAYS,
      );
      expect(fresh.length, friend.key).toBeGreaterThan(0);
    }
  });

  it("backfills only for members whose spec says so, all on the backfill day", () => {
    for (const spec of PERSONAS) {
      const late = journal(seedId(spec.key)).rounds.filter((round) => daysLate(round.createdAt, round.playedOn) > BACKFILL_DAYS);
      if (spec.backfillDaysAgo === null) {
        expect(late, spec.key).toEqual([]);
      } else {
        expect(late.length, spec.key).toBeGreaterThan(1);
        expect(new Set(late.map((round) => round.createdAt.toISOString().slice(0, 10)))).toEqual(new Set([isoDaysAgo(spec.backfillDaysAgo)]));
      }
    }
    expect(PERSONAS.some((spec) => spec.relation === SeedRelation.Friend && spec.backfillDaysAgo !== null)).toBe(true);
  });

  it("keeps seasonal golfers' history rounds between April and October", () => {
    for (const [userId, spec] of [[YOU_ID, YOU] as const, ...PERSONAS.map((entry) => [seedId(entry.key), entry] as const)]) {
      if (!spec.seasonal) continue;
      const fixed = new Set([
        ...spec.recent.map((round) => isoDaysAgo(round.daysAgo)),
        ...spec.trips.flatMap((trip) => trip.days.map((_, day) => isoDaysAgo(trip.startDaysAgo - day))),
      ]);
      for (const round of journal(userId).rounds.filter((entry) => !fixed.has(entry.playedOn))) {
        const month = Number(round.playedOn.slice(5, 7));
        expect(month, `${userId} ${round.playedOn}`).toBeGreaterThanOrEqual(4);
        expect(month, `${userId} ${round.playedOn}`).toBeLessThanOrEqual(10);
      }
    }
  });

  it("connects you to each member as their relation says", () => {
    const withYou = (key: string) =>
      plan.friendships.filter(
        (row) => (row.requesterId === YOU_ID && row.addresseeId === seedId(key)) || (row.addresseeId === YOU_ID && row.requesterId === seedId(key)),
      );
    for (const spec of PERSONAS) {
      const rows = withYou(spec.key);
      switch (spec.relation) {
        case SeedRelation.Friend:
          expect(rows).toMatchObject([{ status: FriendshipStatus.Accepted }]);
          break;
        case SeedRelation.RequestedYou:
          expect(rows).toMatchObject([{ status: FriendshipStatus.Pending, requesterId: seedId(spec.key) }]);
          break;
        case SeedRelation.YouRequested:
          expect(rows).toMatchObject([{ status: FriendshipStatus.Pending, requesterId: YOU_ID }]);
          break;
        case SeedRelation.Stranger:
          expect(rows).toEqual([]);
          break;
      }
    }
  });

  it("has at most one friendship row per pair and none with oneself", () => {
    const pairs = plan.friendships.map((row) => [row.requesterId, row.addresseeId].sort().join("+"));
    expect(new Set(pairs).size).toBe(pairs.length);
    expect(plan.friendships.filter((row) => row.requesterId === row.addresseeId)).toEqual([]);
  });

  it("plans the same rows for the same day", () => {
    expect(planSeed({ catalog: committedCatalog, youId: YOU_ID, now: NOW, includeYou: true })).toEqual(plan);
  });

  it("plans nothing for your list when you are left out", () => {
    const withoutYou = planSeed({ catalog: committedCatalog, youId: YOU_ID, now: NOW, includeYou: false });
    expect(withoutYou.journals.map((entry) => entry.userId)).not.toContain(YOU_ID);
    expect(withoutYou.friendships).toEqual(plan.friendships);
  });
});

describe("planSeed problems", () => {
  const catalog = [course("Alpha Links"), course("Twin Links", { stateRank: 3 }), course("Twin Links", { stateRank: 9 })];
  const cases: { name: string; personas: PersonaSpec[]; message: RegExp }[] = [
    { name: "an unknown course", personas: [persona("a", { courses: ["Nowhere Links"] })], message: /"Nowhere Links" is not in the catalog/ },
    { name: "a name with two ranked rows", personas: [persona("a", { courses: ["Twin Links"] })], message: /"Twin Links" matches 2 catalog courses/ },
    { name: "an invalid username", personas: [persona("a", { username: "no spaces" })], message: /"no spaces" breaks the username rule/ },
    { name: "a duplicate username", personas: [persona("a"), persona("b", { username: "A_GOLFER" })], message: /"A_GOLFER" is used twice/ },
    { name: "an unknown friend", personas: [persona("a", { friendsWith: ["zed"] })], message: /unknown persona "zed"/ },
    { name: "a pair listed twice", personas: [persona("a", { friendsWith: ["b"] }), persona("b", { friendsWith: ["a"] })], message: /a\+b is listed twice/ },
    { name: "a round today", personas: [persona("a", { recent: [{ daysAgo: 0, course: "Alpha Links" }] })], message: /at least a day ago/ },
  ];
  it.each(cases)("stops on $name", ({ personas, message }) => {
    expect(() => planSeed({ catalog, youId: YOU_ID, now: NOW, includeYou: false, personas })).toThrow(message);
  });
});

describe("planSeed choices", () => {
  const only = (spec: GolferSpec, catalog: readonly Course[], now = NOW): SeedPlan =>
    planSeed({ catalog, youId: YOU_ID, now, includeYou: true, personas: [], you: spec });

  it("resolves a duplicated name to its Best-in-State row", () => {
    const listed = course("Twin Links", { stateRank: 4 });
    const result = only(golfer({ courses: ["Twin Links"] }), [course("Twin Links"), listed]);
    expect(result.journals[0]?.courseIds).toEqual([listed.id]);
  });

  it("skips filler courses whose name matches a listed course once normalized", () => {
    const twin = course("Alpha Links Golf Club", { state: "MI", stateRank: 1 });
    const others = [course("Beta", { state: "MI", stateRank: 2 }), course("Gamma", { state: "MI", stateRank: 3 })];
    const result = only(golfer({ courses: ["Alpha Links"], filler: { states: ["MI"], minRank: 1, maxRank: 3, count: 3 } }), [
      course("Alpha Links"),
      twin,
      ...others,
    ]);
    expect(result.journals[0]?.courseIds).not.toContain(twin.id);
    expect(result.journals[0]?.courseIds).toEqual(expect.arrayContaining(others.map((entry) => entry.id)));
  });

  it("ranks a world-famous course above an unranked one", () => {
    const famous = course("Famous Links", { world: 1 });
    const result = only(golfer({ courses: ["Muni", "Famous Links"] }), [course("Muni"), famous]);
    expect(result.journals[0]?.courseIds[0]).toBe(famous.id);
  });

  it("never logs a round later than a minute before now", () => {
    const justAfterMidnight = new Date("2026-09-30T00:10:00Z");
    const result = only(golfer({ courses: ["Alpha Links"], recent: [{ daysAgo: 1, course: "Alpha Links" }] }), [course("Alpha Links")], justAfterMidnight);
    for (const round of result.journals[0]?.rounds ?? []) expect(round.createdAt.getTime()).toBeLessThanOrEqual(justAfterMidnight.getTime() - 60_000);
  });

  it("plays a home course about roundsPerYear times a year, plus recent rounds", () => {
    const result = only(
      golfer({ home: { course: "Home Muni", roundsPerYear: 10 }, historyDays: 730, recent: [{ daysAgo: 2, course: "Home Muni" }] }),
      [course("Home Muni")],
    );
    expect(result.journals[0]?.rounds).toHaveLength(21);
  });
});

describe("summarizePlan", () => {
  it("counts members, your connections and both sides' lists", () => {
    const personas = [
      persona("a"),
      persona("b", { relation: SeedRelation.RequestedYou }),
      persona("c", { relation: SeedRelation.YouRequested }),
      persona("d", { relation: SeedRelation.Stranger }),
    ];
    const small = planSeed({ catalog: [course("Alpha Links")], youId: YOU_ID, now: NOW, includeYou: true, personas, you: golfer({ courses: ["Alpha Links"] }) });
    const rounds = (entries: readonly SeedJournal[]) => entries.reduce((sum, entry) => sum + entry.rounds.length, 0);
    expect(summarizePlan(small, YOU_ID)).toEqual({
      members: 4,
      friends: 1,
      requestsToYou: 1,
      requestsFromYou: 1,
      theirCourses: 4,
      theirRounds: rounds(small.journals.filter((entry) => entry.userId !== YOU_ID)),
      yourCourses: 1,
      yourRounds: rounds(small.journals.filter((entry) => entry.userId === YOU_ID)),
    });
  });
});

describe("prestige", () => {
  it.each([
    { name: "world rank", fields: { world: 5 }, expected: 5 },
    { name: "USA rank", fields: { usa: 20 }, expected: 30 },
    { name: "public rank", fields: { public: 10 }, expected: 45 },
    { name: "state rank", fields: { stateRank: 3 }, expected: 66 },
    { name: "the best of several", fields: { usa: 50, stateRank: 1 }, expected: 60 },
    { name: "unranked", fields: {}, expected: 320 },
  ])("scores $name", ({ fields, expected }) => {
    expect(prestige(course("Any", fields))).toBe(expected);
  });
});

describe("randomFor", () => {
  it("repeats a key's sequence, differs between keys and stays in [0, 1)", () => {
    const draw = (key: string) => {
      const random = randomFor(key);
      return Array.from({ length: 50 }, () => random());
    };
    expect(draw("maya")).toEqual(draw("maya"));
    expect(draw("maya")).not.toEqual(draw("dan"));
    for (const value of draw("maya")) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
