import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database schema for coursebook.golf.
 *
 * Rules the schema enforces (see docs/architecture.md, "Schema"):
 * - A play count is COUNT(rounds); there is no stored counter.
 * - A round cannot exist without a membership (composite foreign key).
 * - Personal ranks are positive and unique per user. The uniqueness
 *   constraint is DEFERRABLE so a reorder can renumber a whole list in one
 *   statement; drizzle-kit cannot express deferrability, so that constraint
 *   lives in the custom migration 0002_deferred_rank_unique.sql.
 */

export const rankingType = pgEnum("ranking_type", [
  "world",
  "usa",
  "usa_public",
  "state",
]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

/** One row per Clerk user. Rows are soft-deleted only. */
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    legacySupabaseId: uuid("legacy_supabase_id"),
    ...timestamps,
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("users_username_lower_idx").on(sql`lower(${table.username})`),
    uniqueIndex("users_legacy_supabase_id_idx").on(table.legacySupabaseId),
  ],
);

/** Shared course catalog: seeded rows plus member-created custom courses. */
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stableId: text("stable_id"),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
    city: text("city"),
    state: text("state"),
    country: text("country").notNull().default("USA"),
    logoUrl: text("logo_url"),
    websiteUrl: text("website_url"),
    isCustom: boolean("is_custom").notNull().default(false),
    createdBy: text("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("courses_stable_id_idx").on(table.stableId),
    index("courses_name_key_country_idx").on(table.nameKey, table.country),
  ],
);

/** Published rankings (Golf Digest world/USA/public and state lists). */
export const courseRankings = pgTable(
  "course_rankings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    rankingType: rankingType("ranking_type").notNull(),
    rank: integer("rank").notNull(),
    scopeCode: text("scope_code").notNull(),
    source: text("source").notNull(),
    sourceYear: integer("source_year").notNull(),
    sourceUrl: text("source_url"),
  },
  (table) => [
    uniqueIndex("course_rankings_scope_rank_idx").on(
      table.rankingType,
      table.scopeCode,
      table.rank,
    ),
    uniqueIndex("course_rankings_course_type_idx").on(
      table.courseId,
      table.rankingType,
    ),
    check("course_rankings_rank_positive", sql`${table.rank} > 0`),
    check(
      "course_rankings_scope_code_required",
      sql`length(trim(${table.scopeCode})) > 0`,
    ),
  ],
);

/** A member's personal list entry. Ranks are contiguous 1..N per user. */
export const userCourses = pgTable(
  "user_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    personalRank: integer("personal_rank").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => [
    unique("user_courses_user_course_unique").on(table.userId, table.courseId),
    index("user_courses_user_rank_idx").on(table.userId, table.personalRank),
    check("user_courses_rank_positive", sql`${table.personalRank} > 0`),
  ],
);

/** One row per round played. Requires a membership for the same user/course. */
export const rounds = pgTable(
  "rounds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    courseId: uuid("course_id").notNull(),
    playedAt: date("played_at", { mode: "string" })
      .notNull()
      .default(sql`CURRENT_DATE`),
    score: integer("score"),
    tees: text("tees"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "rounds_membership_fk",
      columns: [table.userId, table.courseId],
      foreignColumns: [userCourses.userId, userCourses.courseId],
    }).onDelete("cascade"),
    index("rounds_user_course_idx").on(table.userId, table.courseId),
    index("rounds_user_played_idx").on(table.userId, table.playedAt),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type CourseRow = typeof courses.$inferSelect;
export type CourseRankingRow = typeof courseRankings.$inferSelect;
export type UserCourseRow = typeof userCourses.$inferSelect;
export type RoundRow = typeof rounds.$inferSelect;
