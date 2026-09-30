import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FeedItemType } from "@coursebook/domain/social/types";
import { friendships, rounds, userCourses, users, wantToPlay } from "../../src/db/schema";
import { allCourses } from "../../src/services/catalog";
import { friendsFeed } from "../../src/services/feed";
import { memberProfile } from "../../src/services/profiles";
import { memberTimeline } from "../../src/services/timeline";
import { resetMemberData, testDatabase } from "../../src/test/db";
import { PERSONAS, SeedRelation } from "./personas";
import { SEED_ID_PREFIX, planSeed, type SeedPlan } from "./plan";
import { findMember, writeSeed, YourData } from "./run";

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

const YOU = { id: "user_you", username: "you_dev", displayName: "You Developer", email: "you@example.com" };
const BYSTANDER = { id: "user_bystander", username: "bystander", displayName: "Bystander" };

beforeEach(async () => {
  await resetMemberData(db);
  await db.insert(users).values([YOU, BYSTANDER]);
});

const plan = async (includeYou = true): Promise<SeedPlan> =>
  planSeed({ catalog: await allCourses(db), youId: YOU.id, now: new Date(), includeYou });

/** Put one catalog course on a member's list with one round. */
async function listOne(userId: string): Promise<string> {
  const [first] = await allCourses(db);
  if (!first) throw new Error("the catalog is empty");
  await db.insert(userCourses).values({ userId, courseId: first.id, personalRank: 1 });
  await db.insert(rounds).values({ userId, courseId: first.id, playedAt: "2026-06-01" });
  return first.id;
}

const listOf = async (userId: string) =>
  (
    await db
      .select({ courseId: userCourses.courseId })
      .from(userCourses)
      .where(eq(userCourses.userId, userId))
      .orderBy(asc(userCourses.personalRank))
  ).map((row) => row.courseId);
const roundCount = (userId: string) => db.$count(rounds, eq(rounds.userId, userId));
const seededMembers = () => db.$count(users, sql`starts_with(${users.id}, ${SEED_ID_PREFIX})`);

describe("writeSeed", () => {
  it("writes the plan: members, lists in rank order, rounds and friendships", async () => {
    const seed = await plan();
    await writeSeed(db, seed, YOU.id, YourData.FillIfEmpty);

    expect(await seededMembers()).toBe(seed.members.length);
    for (const journal of seed.journals) {
      expect(await listOf(journal.userId)).toEqual(journal.courseIds);
      expect(await roundCount(journal.userId)).toBe(journal.rounds.length);
      expect(await db.$count(wantToPlay, eq(wantToPlay.userId, journal.userId))).toBe(journal.wantToPlay.length);
    }
    expect(await db.$count(friendships)).toBe(seed.friendships.length);
  });

  it("gives you a Home feed with every friend's recent rounds and a collapsed backfill", async () => {
    await writeSeed(db, await plan(), YOU.id, YourData.FillIfEmpty);

    const { items } = await friendsFeed(db, YOU.id, { after: null, limit: 40 });
    const friends = PERSONAS.filter((spec) => spec.relation === SeedRelation.Friend).map((spec) => spec.username);
    expect(new Set(items.map((item) => item.member.username))).toEqual(new Set(friends));
    expect(items.filter((item) => item.type === FeedItemType.Backfill)).toHaveLength(1);
  });

  it("gives you a timeline and a friend's profile with courses in common", async () => {
    const seed = await plan();
    await writeSeed(db, seed, YOU.id, YourData.FillIfEmpty);

    const timeline = await memberTimeline(db, YOU.id, YOU.username, { after: null, limit: 10 });
    expect(timeline?.rounds).toHaveLength(10);
    const profile = await memberProfile(db, YOU.id, "dwhitaker");
    expect(profile?.comparison?.inCommon).toBeGreaterThan(0);
  });

  it("replaces the previous seed on a rerun and leaves other members alone", async () => {
    const bystanderCourse = await listOne(BYSTANDER.id);
    await writeSeed(db, await plan(), YOU.id, YourData.FillIfEmpty);
    const again = await plan();
    await writeSeed(db, again, YOU.id, YourData.Replace);

    expect(await seededMembers()).toBe(again.members.length);
    expect(await db.$count(friendships)).toBe(again.friendships.length);
    expect(await listOf(YOU.id)).toEqual(again.journals.find((journal) => journal.userId === YOU.id)?.courseIds);
    expect(await listOf(BYSTANDER.id)).toEqual([bystanderCourse]);
    expect(await roundCount(BYSTANDER.id)).toBe(1);
  });

  it("stops without writing when your list is not empty", async () => {
    const yourCourse = await listOne(YOU.id);

    await expect(writeSeed(db, await plan(), YOU.id, YourData.FillIfEmpty)).rejects.toThrow(/already have 1 course on your list/);
    expect(await seededMembers()).toBe(0);
    expect(await listOf(YOU.id)).toEqual([yourCourse]);
  });

  it("keeps your list and still connects you when told to keep it", async () => {
    const yourCourse = await listOne(YOU.id);
    const seed = await plan(false);
    await writeSeed(db, seed, YOU.id, YourData.Keep);

    expect(await listOf(YOU.id)).toEqual([yourCourse]);
    expect(await roundCount(YOU.id)).toBe(1);
    expect(await db.$count(friendships)).toBe(seed.friendships.length);
  });

  it("replaces your list when told to", async () => {
    await listOne(YOU.id);
    const seed = await plan();
    await writeSeed(db, seed, YOU.id, YourData.Replace);

    const yours = seed.journals.find((journal) => journal.userId === YOU.id);
    expect(await listOf(YOU.id)).toEqual(yours?.courseIds);
    expect(await roundCount(YOU.id)).toBe(yours?.rounds.length);
  });

  it("refuses a seeded username that belongs to another member", async () => {
    await db.update(users).set({ username: "DWhitaker" }).where(eq(users.id, BYSTANDER.id));

    await expect(writeSeed(db, await plan(), YOU.id, YourData.FillIfEmpty)).rejects.toThrow(/already belong to local members: DWhitaker/);
    expect(await seededMembers()).toBe(0);
  });
});

describe("findMember", () => {
  it.each([
    { reference: "you_dev", found: YOU.id },
    { reference: "YOU_DEV", found: YOU.id },
    { reference: " You@Example.com ", found: YOU.id },
    { reference: "nobody", found: null },
  ])("finds $reference", async ({ reference, found }) => {
    expect((await findMember(db, reference))?.id ?? null).toBe(found);
  });

  it("skips seeded and deleted members", async () => {
    await writeSeed(db, await plan(), YOU.id, YourData.FillIfEmpty);
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, BYSTANDER.id));

    expect(await findMember(db, "dwhitaker")).toBeNull();
    expect(await findMember(db, "bystander")).toBeNull();
  });
});
