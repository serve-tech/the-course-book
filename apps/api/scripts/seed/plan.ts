/**
 * Plan the development seed: pure functions from the persona specs, the
 * catalog and the current time to the member, list, round and friendship
 * rows to write (run.ts writes them).
 *
 * The plan is deterministic for a given day: every golfer draws from their
 * own seeded generator, so editing one persona never reshuffles the others.
 * Dates are relative to the UTC day of `now`; no timestamp is later than a
 * minute before `now`.
 *
 * Rows follow the data rules (docs/architecture.md#data-rules): every round
 * has a membership, every membership has at least one round, and ranks are
 * contiguous from 1.
 */
import { normalizeName, type Course } from "@coursebook/domain/catalog/course";
import { FriendshipStatus } from "../../src/domain/friendship";
import { isValidUsername } from "../../src/domain/username";
import { PERSONAS, SeedRelation, YOU, type GolferSpec, type PersonaSpec } from "./personas";

/** Seeded members' `users.id` prefix; Clerk ids start with `user_`, so none can collide. */
export const SEED_ID_PREFIX = "seed_";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Random history stays this many days clear of the backfill day (or today), so recent feed activity is exactly the spec's. */
const HISTORY_GAP_DAYS = 21;
/** 23:00 UTC is 7 pm on the US East Coast: rounds are logged that evening. */
const EVENING_MINUTES = 23 * 60;
/** Backfilled history is entered in one sitting from 20:00 UTC, 45 seconds a round. */
const BACKFILL_MINUTES = 20 * 60;
const BACKFILL_STEP_MINUTES = 0.75;
/** Chance that a one-off course was played a second time. */
const REPEAT_CHANCE = 0.25;
/** Northern golfers' history months (April to October), 1-based. */
const SEASON = { from: 4, to: 10 } as const;

/** Rank-ordering weights; lower keys rank higher. See `personalOrder`. */
const UNRANKED_PRESTIGE = 320;
const HOME_BONUS = 40;
const REPEAT_BONUS = 8;
const MAX_REPEAT_BONUSES = 3;
const TASTE_NOISE = 60;

/** A seeded member's `users` row. */
export interface SeedMember {
  id: string;
  username: string;
  displayName: string;
  createdAt: Date;
}

/** One round: the course, the date played and when it was logged. */
export interface SeedRound {
  courseId: string;
  playedOn: string;
  createdAt: Date;
}

/** A course on a Want to play list and when it was added. */
export interface SeedWant {
  courseId: string;
  addedAt: Date;
}

/** One member's list, best first (rank = index + 1), their rounds and their Want to play list. */
export interface SeedJournal {
  userId: string;
  courseIds: readonly string[];
  rounds: readonly SeedRound[];
  wantToPlay: readonly SeedWant[];
}

/** A `friendships` row; `updatedAt` is when an accepted request was accepted. */
export interface SeedFriendship {
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeedPlan {
  members: readonly SeedMember[];
  journals: readonly SeedJournal[];
  friendships: readonly SeedFriendship[];
}

export interface SeedInput {
  /** Every catalog course, with published ranks (`allCourses`). */
  catalog: readonly Course[];
  /** Your `users.id`: the developer the seed builds friends around. */
  youId: string;
  now: Date;
  /** False plans nothing for your own list and rounds. */
  includeYou: boolean;
  /** Defaults to `PERSONAS`; tests pass smaller casts. */
  personas?: readonly PersonaSpec[];
  /** Defaults to `YOU`. */
  you?: GolferSpec;
}

/** Counts for the command's report. */
export interface SeedSummary {
  members: number;
  friends: number;
  requestsToYou: number;
  requestsFromYou: number;
  theirCourses: number;
  theirRounds: number;
  yourCourses: number;
  yourRounds: number;
}

/**
 * Plan every seeded row.
 *
 * Raises:
 *     Error: Listing every problem in the specs (unknown or ambiguous course
 *         names, invalid or duplicate usernames, unknown friends, dates that
 *         are not in the past) before anything is planned.
 */
export function planSeed(input: SeedInput): SeedPlan {
  const personas = input.personas ?? PERSONAS;
  const you = input.you ?? YOU;
  const golfers: readonly GolferSpec[] = input.includeYou ? [you, ...personas] : personas;
  const problems = specProblems(personas, golfers);
  const resolved = resolveCourses(input.catalog, golfers.flatMap(namedCourses));
  problems.push(...resolved.problems);
  if (problems.length) throw new Error(`Seed data problems:\n${problems.map((problem) => `  - ${problem}`).join("\n")}`);

  const clock = clockAt(input.now);
  const course = (name: string): Course => {
    const found = resolved.byName.get(name);
    if (!found) throw new Error(`Course "${name}" was not resolved`);
    return found;
  };
  const journals = personas.map((persona) =>
    planJournal(seedId(persona.key), persona, persona.key, { catalog: input.catalog, course, clock }),
  );
  if (input.includeYou) journals.unshift(planJournal(input.youId, you, "you", { catalog: input.catalog, course, clock }));

  return {
    members: personas.map((persona) => ({
      id: seedId(persona.key),
      username: persona.username,
      displayName: persona.displayName,
      createdAt: clock.at(persona.joinedDaysAgo, 14 * 60),
    })),
    journals,
    friendships: planFriendships(personas, input.youId, clock),
  };
}

/** Counts of what the plan seeds, split between the seeded members and you. */
export function summarizePlan(plan: SeedPlan, youId: string): SeedSummary {
  const yours = plan.journals.find((journal) => journal.userId === youId);
  const theirs = plan.journals.filter((journal) => journal.userId !== youId);
  const withYou = plan.friendships.filter((row) => row.requesterId === youId || row.addresseeId === youId);
  return {
    members: plan.members.length,
    friends: withYou.filter((row) => row.status === FriendshipStatus.Accepted).length,
    requestsToYou: withYou.filter((row) => row.status === FriendshipStatus.Pending && row.addresseeId === youId).length,
    requestsFromYou: withYou.filter((row) => row.status === FriendshipStatus.Pending && row.requesterId === youId).length,
    theirCourses: theirs.reduce((sum, journal) => sum + journal.courseIds.length, 0),
    theirRounds: theirs.reduce((sum, journal) => sum + journal.rounds.length, 0),
    yourCourses: yours?.courseIds.length ?? 0,
    yourRounds: yours?.rounds.length ?? 0,
  };
}

/** A seeded member's `users.id`. */
export function seedId(key: string): string {
  return SEED_ID_PREFIX + key;
}

/**
 * A deterministic generator in [0, 1) seeded from a string (FNV-1a hash into
 * mulberry32), so the same key always draws the same sequence.
 */
export function randomFor(key: string): () => number {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ (char.codePointAt(0) ?? 0), 16777619);
  let state = hash >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How highly golfers tend to rate a course from its published ranks alone:
 * world, then USA, public and Best-in-State ranks on one scale (lower is
 * better). Unranked courses score `UNRANKED_PRESTIGE`.
 */
export function prestige(course: Course): number {
  return Math.min(
    course.world ?? Infinity,
    course.usa === null ? Infinity : course.usa + 10,
    course.public === null ? Infinity : course.public * 1.5 + 30,
    course.stateRank === null ? Infinity : course.stateRank * 2 + 60,
    UNRANKED_PRESTIGE,
  );
}

interface Clock {
  /** ISO date `daysAgo` days before today (UTC). */
  date(daysAgo: number): string;
  /** `minutes` past midnight UTC, `daysAgo` days before today, but no later than a minute before now. */
  at(daysAgo: number, minutes: number): Date;
}

function clockAt(now: Date): Clock {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const latest = now.getTime() - MINUTE_MS;
  return {
    date: (daysAgo) => new Date(today - daysAgo * DAY_MS).toISOString().slice(0, 10),
    at: (daysAgo, minutes) => new Date(Math.min(today - daysAgo * DAY_MS + minutes * MINUTE_MS, latest)),
  };
}

/** Every course name a golfer spec refers to. */
function namedCourses(spec: GolferSpec): string[] {
  return [
    ...(spec.home ? [spec.home.course] : []),
    ...spec.courses,
    ...spec.trips.flatMap((trip) => trip.days.flat()),
    ...spec.recent.map((round) => round.course),
    ...spec.wantToPlay.map((wanted) => wanted.course),
  ];
}

/**
 * Resolve course names to catalog rows.
 *
 * A name held by several rows (legacy duplicates such as the two "Harbour
 * Town Golf Links") resolves to the one on a Best-in-State list, the same
 * rows filler picks come from, so a named course and a filler pick are never
 * two rows of one course.
 */
function resolveCourses(catalog: readonly Course[], names: readonly string[]) {
  const byExactName = new Map<string, Course[]>();
  for (const course of catalog) byExactName.set(course.name, [...(byExactName.get(course.name) ?? []), course]);
  const byName = new Map<string, Course>();
  const problems: string[] = [];
  for (const name of new Set(names)) {
    const rows = byExactName.get(name) ?? [];
    const ranked = rows.filter((row) => row.stateRank !== null);
    const chosen = rows.length === 1 ? rows[0] : ranked.length === 1 ? ranked[0] : undefined;
    if (chosen) byName.set(name, chosen);
    else problems.push(rows.length ? `"${name}" matches ${String(rows.length)} catalog courses` : `"${name}" is not in the catalog`);
  }
  return { byName, problems };
}

/** Problems in the persona specs that would make the plan invalid. */
function specProblems(personas: readonly PersonaSpec[], golfers: readonly GolferSpec[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  const usernames = new Set<string>();
  const pairs = new Set<string>();
  for (const persona of personas) {
    if (keys.has(persona.key)) problems.push(`persona key "${persona.key}" is used twice`);
    keys.add(persona.key);
    const username = persona.username.toLowerCase();
    if (!isValidUsername(persona.username)) problems.push(`username "${persona.username}" breaks the username rule`);
    if (usernames.has(username)) problems.push(`username "${persona.username}" is used twice`);
    usernames.add(username);
  }
  for (const persona of personas) {
    for (const friend of persona.friendsWith) {
      const pair = [persona.key, friend].sort().join("+");
      if (!keys.has(friend) || friend === persona.key) problems.push(`"${persona.key}" is friends with unknown persona "${friend}"`);
      else if (pairs.has(pair)) problems.push(`friendship ${pair} is listed twice`);
      pairs.add(pair);
    }
  }
  for (const golfer of golfers) {
    const days = [
      ...golfer.recent.map((round) => round.daysAgo),
      ...golfer.trips.map((trip) => trip.startDaysAgo - trip.days.length + 1),
      ...golfer.wantToPlay.map((wanted) => wanted.daysAgo),
    ];
    if (golfer.backfillDaysAgo !== null) days.push(golfer.backfillDaysAgo);
    if (days.some((daysAgo) => daysAgo < 1)) problems.push("rounds, backfills and Want to play must be at least a day ago");
  }
  return problems;
}

interface PlannedRound {
  course: Course;
  daysAgo: number;
  /** Position among rounds played the same day (36 holes). */
  order: number;
  /** Recent rounds are logged the evening they were played, even for a backfilling golfer. */
  recent: boolean;
}

interface JournalContext {
  catalog: readonly Course[];
  course: (name: string) => Course;
  clock: Clock;
}

/** One golfer's list and rounds. `key` seeds their random draws. */
function planJournal(userId: string, spec: GolferSpec, key: string, context: JournalContext): SeedJournal {
  const { course, clock } = context;
  const random = randomFor(key);
  const historyDay = historyDays(spec, clock, random);
  const played: PlannedRound[] = [];
  const once = (picked: Course) => {
    const times = random() < REPEAT_CHANCE ? 2 : 1;
    for (let visit = 0; visit < times; visit++) played.push({ course: picked, daysAgo: historyDay(), order: 0, recent: false });
  };

  if (spec.home) {
    const visits = Math.round((spec.home.roundsPerYear * spec.historyDays) / 365);
    for (let visit = 0; visit < visits; visit++) played.push({ course: course(spec.home.course), daysAgo: historyDay(), order: 0, recent: false });
  }
  for (const name of spec.courses) once(course(name));
  for (const trip of spec.trips)
    trip.days.forEach((names, day) => {
      names.forEach((name, order) => played.push({ course: course(name), daysAgo: trip.startDaysAgo - day, order, recent: false }));
    });
  for (const round of spec.recent) played.push({ course: course(round.course), daysAgo: round.daysAgo, order: 0, recent: true });
  // Filler skips wanted courses too: a filler round logged after the course was wanted would have taken it off the list.
  const listed = new Set([...played.map((round) => round.course.name), ...spec.wantToPlay.map((wanted) => course(wanted.course).name)].map(normalizeName));
  for (const pick of fillerPicks(spec, context.catalog, listed, random)) once(pick);

  return {
    userId,
    courseIds: personalOrder(played, spec.home ? course(spec.home.course).id : null, random),
    rounds: loggedRounds(played, spec.backfillDaysAgo, clock, random),
    wantToPlay: spec.wantToPlay.map((wanted) => ({ courseId: course(wanted.course).id, addedAt: clock.at(wanted.daysAgo, 18 * 60) })),
  };
}

/**
 * A picker of random history days: at least `HISTORY_GAP_DAYS` clear of the
 * backfill day (or today) and within `historyDays`, in season for seasonal
 * golfers.
 */
function historyDays(spec: GolferSpec, clock: Clock, random: () => number): () => number {
  const first = (spec.backfillDaysAgo ?? 0) + HISTORY_GAP_DAYS;
  const days: number[] = [];
  for (let daysAgo = first; daysAgo <= spec.historyDays; daysAgo++) {
    const month = Number(clock.date(daysAgo).slice(5, 7));
    if (!spec.seasonal || (month >= SEASON.from && month <= SEASON.to)) days.push(daysAgo);
  }
  return () => {
    const day = days[Math.floor(random() * days.length)];
    if (day === undefined) throw new Error(`No history days between ${String(first)} and ${String(spec.historyDays)} days ago`);
    return day;
  };
}

/**
 * Random Best-in-State courses for the golfer's filler, skipping any whose
 * normalized name is already on their list (catalog twins such as "TPC San
 * Antonio (Oaks)" and "TPC San Antonio: Oaks Course").
 */
function fillerPicks(spec: GolferSpec, catalog: readonly Course[], listed: ReadonlySet<string>, random: () => number): Course[] {
  const filler = spec.filler;
  if (!filler) return [];
  const candidates = catalog
    .filter(
      (course) =>
        filler.states.includes(course.state) &&
        course.stateRank !== null &&
        course.stateRank >= filler.minRank &&
        course.stateRank <= filler.maxRank &&
        !listed.has(normalizeName(course.name)),
    )
    .sort((a, b) => (a.stateRank ?? 0) - (b.stateRank ?? 0) || a.id.localeCompare(b.id));
  const picks: Course[] = [];
  const names = new Set<string>();
  while (candidates.length && picks.length < filler.count) {
    const [pick] = candidates.splice(Math.floor(random() * candidates.length), 1);
    if (!pick || names.has(normalizeName(pick.name))) continue;
    names.add(normalizeName(pick.name));
    picks.push(pick);
  }
  return picks;
}

/**
 * The golfer's list, best first: published prestige, a home-course bonus, a
 * bonus per repeat visit (up to `MAX_REPEAT_BONUSES`) and personal taste
 * (noise), so friends broadly agree about famous courses but not exactly.
 */
function personalOrder(played: readonly PlannedRound[], homeId: string | null, random: () => number): string[] {
  const visits = new Map<string, { course: Course; count: number }>();
  for (const round of played) {
    const entry = visits.get(round.course.id);
    if (entry) entry.count++;
    else visits.set(round.course.id, { course: round.course, count: 1 });
  }
  const keyed = [...visits.values()].map(({ course, count }) => ({
    id: course.id,
    key:
      prestige(course) -
      (course.id === homeId ? HOME_BONUS : 0) -
      REPEAT_BONUS * Math.min(count - 1, MAX_REPEAT_BONUSES) +
      random() * TASTE_NOISE,
  }));
  return keyed.sort((a, b) => a.key - b.key || a.id.localeCompare(b.id)).map((entry) => entry.id);
}

/**
 * When each round was logged. Rounds are logged the evening they were played
 * (a second round that day a few minutes later); a backfilling golfer's
 * non-recent rounds were all entered on the backfill day, oldest first.
 */
function loggedRounds(played: readonly PlannedRound[], backfillDaysAgo: number | null, clock: Clock, random: () => number): SeedRound[] {
  const backfilled = backfillDaysAgo === null ? [] : played.filter((round) => !round.recent);
  const backfillOrder = [...backfilled].sort((a, b) => b.daysAgo - a.daysAgo || a.order - b.order || a.course.id.localeCompare(b.course.id));
  const rounds = played.map((round): SeedRound => {
    const position = backfillOrder.indexOf(round);
    const createdAt =
      backfillDaysAgo !== null && position >= 0
        ? clock.at(backfillDaysAgo, BACKFILL_MINUTES + position * BACKFILL_STEP_MINUTES)
        : clock.at(round.daysAgo, EVENING_MINUTES + Math.floor(random() * 150) + round.order * 7);
    return { courseId: round.course.id, playedOn: clock.date(round.daysAgo), createdAt };
  });
  return rounds.sort((a, b) => a.playedOn.localeCompare(b.playedOn) || a.createdAt.getTime() - b.createdAt.getTime());
}

/** Your friendships and requests, then friendships among the seeded members. */
function planFriendships(personas: readonly PersonaSpec[], youId: string, clock: Clock): SeedFriendship[] {
  const rows: SeedFriendship[] = [];
  for (const persona of personas) {
    const id = seedId(persona.key);
    const sent = clock.at(persona.sinceDaysAgo, 15 * 60);
    switch (persona.relation) {
      case SeedRelation.Friend:
        rows.push({ requesterId: id, addresseeId: youId, status: FriendshipStatus.Accepted, createdAt: sent, updatedAt: clock.at(persona.sinceDaysAgo, 16 * 60 + 30) });
        break;
      case SeedRelation.RequestedYou:
        rows.push({ requesterId: id, addresseeId: youId, status: FriendshipStatus.Pending, createdAt: sent, updatedAt: sent });
        break;
      case SeedRelation.YouRequested:
        rows.push({ requesterId: youId, addresseeId: id, status: FriendshipStatus.Pending, createdAt: sent, updatedAt: sent });
        break;
      case SeedRelation.Stranger:
        break;
    }
  }
  const joined = new Map(personas.map((persona) => [persona.key, persona.joinedDaysAgo]));
  for (const persona of personas)
    for (const friend of persona.friendsWith) {
      const since = Math.min(persona.joinedDaysAgo, joined.get(friend) ?? persona.joinedDaysAgo);
      rows.push({
        requesterId: seedId(persona.key),
        addresseeId: seedId(friend),
        status: FriendshipStatus.Accepted,
        createdAt: clock.at(since, 17 * 60),
        updatedAt: clock.at(since, 18 * 60),
      });
    }
  return rows;
}
