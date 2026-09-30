/**
 * Who the development seed creates and what they have played.
 *
 * Course names are exact catalog names (`courses.name`); the planner stops
 * with every unknown or ambiguous name listed. The catalog has legacy
 * duplicates (e.g. "Sheep Ranch" and "Bandon Dunes Golf Resort: Sheep
 * Ranch"), so trips name one row of each course, a name held by two rows
 * resolves to the one on a Best-in-State list, and filler picks come only
 * from Best-in-State lists, which hold each course once.
 *
 * Every date is relative to the day the seed runs, so the Home feed always
 * has fresh activity: each friend has something logged in the last two
 * weeks, and the rest of their history sits at least three weeks back.
 */

/** How a seeded member relates to you, the developer running the seed. */
export enum SeedRelation {
  /** Accepted friends: their rounds are on your Home feed. */
  Friend = "friend",
  /** They sent you a friend request you have not answered. */
  RequestedYou = "requested_you",
  /** You sent them a friend request they have not answered. */
  YouRequested = "you_requested",
  /** No connection; findable in Friends search. */
  Stranger = "stranger",
}

/** A run of consecutive golf days; each day lists the courses played that day, in order. */
export interface TripSpec {
  /** Days before today of the trip's first day. */
  startDaysAgo: number;
  days: readonly (readonly string[])[];
}

/** A round played `daysAgo` days before today and logged that evening. */
export interface RecentRound {
  daysAgo: number;
  course: string;
}

/** What one golfer (a seeded member or you) has played. */
export interface GolferSpec {
  /** A course played many times, spread over the history window. */
  home: { course: string; roundsPerYear: number } | null;
  /** Courses played once (sometimes twice) on random history dates. */
  courses: readonly string[];
  /** Random picks from Best-in-State lists, ranks `minRank`..`maxRank` inclusive. */
  filler: { states: readonly string[]; minRank: number; maxRank: number; count: number } | null;
  trips: readonly TripSpec[];
  /** Rounds that always show on friends' feeds as fresh activity. */
  recent: readonly RecentRound[];
  /** How far back random history dates reach, in days. */
  historyDays: number;
  /** Northern golfers play history rounds from April to October only. */
  seasonal: boolean;
  /**
   * The day (days ago) this golfer logged all their history at once, as a
   * new member entering past rounds does; null when every round was logged
   * the evening it was played. Recent rounds are never backfilled.
   */
  backfillDaysAgo: number | null;
}

/** A seeded member. */
export interface PersonaSpec extends GolferSpec {
  /** Stable key; the member's `users.id` is `seed_<key>`. */
  key: string;
  username: string;
  displayName: string;
  joinedDaysAgo: number;
  relation: SeedRelation;
  /** Friends: days since the friendship was accepted. Requests: days since sent. Ignored for strangers. */
  sinceDaysAgo: number;
  /** Keys of other personas who are this member's friends (each pair listed once). */
  friendsWith: readonly string[];
}

/** You: Michigan-based, a home muni, two buddy trips and a couple of rounds this month. */
export const YOU: GolferSpec = {
  home: { course: "Washtenaw Golf Club", roundsPerYear: 5 },
  courses: [
    "Rackham Golf Course",
    "Tullymore Golf Resort",
    "Treetops Resort: Fazio",
    "Forest Dunes Golf Club",
    "Arcadia Bluffs Golf Club",
    "Oakland Hills Country Club: South",
    "Whistling Straits: Straits",
  ],
  filler: { states: ["MI"], minRank: 10, maxRank: 70, count: 7 },
  trips: [
    { startDaysAgo: 820, days: [["Bandon Dunes"], ["Pacific Dunes", "Bandon Trails"], ["Old Macdonald"]] },
    { startDaysAgo: 170, days: [["Pinehurst No. 2"], ["Pinehurst #4", "Mid Pines Inn & Golf Club"], ["Pine Needles Lodge & Golf Club"]] },
  ],
  recent: [
    { daysAgo: 3, course: "Washtenaw Golf Club" },
    { daysAgo: 9, course: "Arcadia Bluffs Golf Club" },
  ],
  historyDays: 1095,
  seasonal: true,
  backfillDaysAgo: null,
};

export const PERSONAS: readonly PersonaSpec[] = [
  {
    key: "dan",
    username: "dwhitaker",
    displayName: "Dan Whitaker",
    joinedDaysAgo: 1100,
    relation: SeedRelation.Friend,
    sinceDaysAgo: 900,
    friendsWith: ["kevin"],
    home: { course: "Rackham Golf Course", roundsPerYear: 10 },
    courses: [
      "Oakland Hills Country Club: South",
      "Detroit Golf Club: North",
      "Tullymore Golf Resort",
      "Treetops Resort: Fazio",
      "Treetops Resort: Smith",
      "Treetops Resort: Robert Trent Jones Sr.",
      "Arcadia Bluffs Golf Club",
    ],
    filler: { states: ["MI"], minRank: 20, maxRank: 100, count: 10 },
    trips: [{ startDaysAgo: 12, days: [["Forest Dunes Golf Club"], ["The Loop: Black", "The Loop: Red"]] }],
    recent: [
      { daysAgo: 6, course: "Rackham Golf Course" },
      { daysAgo: 2, course: "Rackham Golf Course" },
    ],
    historyDays: 1090,
    seasonal: true,
    backfillDaysAgo: null,
  },
  {
    key: "maya",
    username: "mayacastillo",
    displayName: "Maya Castillo",
    joinedDaysAgo: 800,
    relation: SeedRelation.Friend,
    sinceDaysAgo: 400,
    friendsWith: ["priya", "sam"],
    home: { course: "Pasatiempo Golf Club", roundsPerYear: 6 },
    courses: [
      "Pebble Beach Golf Links",
      "Spyglass Hill Golf Course",
      "The Links At Spanish Bay",
      "Torrey Pines Golf Course: South",
      "PGA West: Stadium Course",
      "CordeValle Golf Club",
    ],
    filler: { states: ["CA"], minRank: 8, maxRank: 60, count: 6 },
    trips: [{ startDaysAgo: 7, days: [["Bandon Dunes"], ["Pacific Dunes", "Old Macdonald"], ["Bandon Trails"]] }],
    recent: [{ daysAgo: 1, course: "Pasatiempo Golf Club" }],
    historyDays: 790,
    seasonal: false,
    backfillDaysAgo: null,
  },
  {
    key: "priya",
    username: "priyaraman",
    displayName: "Priya Raman",
    joinedDaysAgo: 1100,
    relation: SeedRelation.Friend,
    sinceDaysAgo: 600,
    friendsWith: ["ellie"],
    home: { course: "Bethpage Black", roundsPerYear: 3 },
    courses: [
      "Pinehurst No. 2",
      "Kiawah Island Golf Resort: The Ocean Course",
      "Whistling Straits: Straits",
      "Erin Hills",
      "Pebble Beach Golf Links",
      "TPC Sawgrass: Stadium",
      "Pacific Dunes",
      "Friar's Head Golf Club",
    ],
    filler: { states: ["NY"], minRank: 1, maxRank: 60, count: 8 },
    trips: [
      {
        startDaysAgo: 21,
        days: [
          ["St. Andrews Links: Old"],
          ["Kingsbarns Golf Links"],
          ["Carnoustie Golf Links (Championship)"],
          ["North Berwick Golf Club"],
          ["Muirfield"],
        ],
      },
    ],
    recent: [{ daysAgo: 3, course: "Bethpage Black" }],
    historyDays: 1090,
    seasonal: true,
    backfillDaysAgo: null,
  },
  {
    key: "kevin",
    username: "kbrandt",
    displayName: "Kevin Brandt",
    joinedDaysAgo: 500,
    relation: SeedRelation.Friend,
    sinceDaysAgo: 200,
    friendsWith: [],
    home: { course: "Blue Mound Golf & Country Club", roundsPerYear: 8 },
    courses: [
      "Erin Hills",
      "Whistling Straits: Straits",
      "Blackwolf Run: River",
      "SentryWorld Golf Club",
      "The Golf Courses of Lawsonia: Links",
      "Cog Hill Golf & Country Club: # 4 - Dubsdread",
    ],
    filler: { states: ["WI", "IL"], minRank: 5, maxRank: 40, count: 6 },
    trips: [{ startDaysAgo: 11, days: [["Sand Valley", "Mammoth Dunes"], ["The Lido at Sand Valley"], ["Sedge Valley at Sand Valley"]] }],
    recent: [{ daysAgo: 4, course: "Blue Mound Golf & Country Club" }],
    historyDays: 490,
    seasonal: true,
    backfillDaysAgo: null,
  },
  {
    key: "marcus",
    username: "marcusbell",
    displayName: "Marcus Bell",
    joinedDaysAgo: 1,
    relation: SeedRelation.Friend,
    sinceDaysAgo: 1,
    friendsWith: ["luis"],
    home: null,
    courses: [
      "TPC Sawgrass: Stadium",
      "Harbour Town Golf Links",
      "Kiawah Island Golf Resort: The Ocean Course",
      "Streamsong Resort: Red",
      "Streamsong Resort: Blue",
      "Streamsong Resort: Black",
      "Sea Island: Seaside",
      "Reynolds Lake Oconee: Great Waters",
      "Pinehurst No. 2",
      "Tobacco Road Golf Club",
      "The Dunes Golf & Beach Club",
      "East Lake Golf Club",
    ],
    filler: { states: ["GA", "SC"], minRank: 10, maxRank: 50, count: 8 },
    trips: [],
    recent: [{ daysAgo: 1, course: "Sea Island: Seaside" }],
    historyDays: 1825,
    seasonal: false,
    backfillDaysAgo: 1,
  },
  {
    key: "luis",
    username: "luismoreno",
    displayName: "Luis Moreno",
    joinedDaysAgo: 60,
    relation: SeedRelation.RequestedYou,
    sinceDaysAgo: 2,
    friendsWith: [],
    home: null,
    courses: [
      "PGA Frisco: Fields Ranch East",
      "Fields Ranch PGA of America Frisco: West Course",
      "TPC San Antonio: Oaks Course",
      "Colonial Country Club",
    ],
    filler: { states: ["TX"], minRank: 1, maxRank: 40, count: 7 },
    trips: [],
    recent: [
      { daysAgo: 10, course: "TPC San Antonio: Oaks Course" },
      { daysAgo: 3, course: "PGA Frisco: Fields Ranch East" },
    ],
    historyDays: 730,
    seasonal: false,
    backfillDaysAgo: 58,
  },
  {
    key: "sam",
    username: "samcho",
    displayName: "Sam Cho",
    joinedDaysAgo: 300,
    relation: SeedRelation.YouRequested,
    sinceDaysAgo: 5,
    friendsWith: [],
    home: null,
    courses: ["Quintero Golf Club"],
    filler: { states: ["AZ"], minRank: 1, maxRank: 30, count: 6 },
    trips: [],
    recent: [{ daysAgo: 4, course: "Quintero Golf Club" }],
    historyDays: 290,
    seasonal: false,
    backfillDaysAgo: null,
  },
  {
    key: "ellie",
    username: "ellienovak",
    displayName: "Ellie Novak",
    joinedDaysAgo: 700,
    relation: SeedRelation.Stranger,
    sinceDaysAgo: 0,
    friendsWith: [],
    home: null,
    courses: ["Nemacolin: Mystic Rock"],
    filler: { states: ["PA"], minRank: 1, maxRank: 45, count: 8 },
    trips: [],
    recent: [{ daysAgo: 5, course: "Nemacolin: Mystic Rock" }],
    historyDays: 690,
    seasonal: true,
    backfillDaysAgo: null,
  },
];
