/**
 * Boundary schemas for the Supabase CSV exports (docs/cutover.md step 3.1).
 *
 * psql writes every value as text: an empty field for NULL, `t`/`f` for
 * booleans, `2026-09-14 19:08:59.566482+00` for timestamptz and `YYYY-MM-DD`
 * for date. Every row of every file is validated here, so a malformed value
 * stops the import with its file and row instead of becoming `NaN` or an empty
 * string further on. Extra columns are ignored; a missing column fails every
 * row, which catches an export made with the wrong query.
 *
 * `auth_users.csv` carries password hashes. Validation messages never include
 * values, and nothing here logs a row.
 */
import { z } from "zod";

const blankToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

const id = z.guid();
const optionalId = z.preprocess(blankToNull, z.guid().nullable());
const optionalText = z.preprocess(blankToNull, z.string().nullable());
const optionalInt = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^-?\d+$/, "must be a whole number")
    .transform(Number)
    .nullable(),
);
const optionalDate = z.preprocess(
  blankToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .refine((value) => new Date(value + "T00:00:00Z").toISOString().startsWith(value), "must be a calendar date")
    .nullable(),
);
const optionalTimestamp = z.preprocess(
  blankToNull,
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), "must be a timestamp")
    .nullable(),
);
const optionalFlag = z.preprocess(
  blankToNull,
  z
    .enum(["t", "f", "true", "false"])
    .transform((value) => value === "t" || value === "true")
    .nullable(),
);

/** `select id, email, encrypted_password from auth.users`. */
export const authUserRow = z.object({
  id,
  email: optionalText,
  encrypted_password: optionalText,
});

export const profileRow = z.object({
  id,
  email: optionalText,
  username: optionalText,
  display_name: optionalText,
  avatar_url: optionalText,
});

export const courseRow = z.object({
  id,
  name: z.string().trim().min(1, "must not be empty"),
  city: optionalText,
  state: optionalText,
  country: optionalText,
  logo_url: optionalText,
  website_url: optionalText,
  is_custom: optionalFlag,
  created_at: optionalTimestamp,
});

/** `user_courses`; `times_played` is the old app's stored count, never displayed. */
export const membershipRow = z.object({
  id,
  user_id: optionalId,
  course_id: optionalId,
  personal_rank: optionalInt,
  times_played: optionalInt,
  created_at: optionalTimestamp,
  notes: optionalText,
});

export const roundRow = z.object({
  id,
  user_id: optionalId,
  course_id: optionalId,
  played_at: optionalDate,
  score: optionalInt,
  tees: optionalText,
  notes: optionalText,
  created_at: optionalTimestamp,
});

export type AuthUserRow = z.output<typeof authUserRow>;
export type ProfileRow = z.output<typeof profileRow>;
export type CourseRow = z.output<typeof courseRow>;
export type MembershipRow = z.output<typeof membershipRow>;
export type RoundRow = z.output<typeof roundRow>;

/** The five exported tables, validated. */
export interface SupabaseExport {
  authUsers: AuthUserRow[];
  profiles: ProfileRow[];
  courses: CourseRow[];
  memberships: MembershipRow[];
  rounds: RoundRow[];
}

/** Raw CSV records per export file, as parsed with their header row. */
export interface ExportFiles {
  "auth_users.csv": readonly Record<string, unknown>[];
  "profiles.csv": readonly Record<string, unknown>[];
  "courses.csv": readonly Record<string, unknown>[];
  "user_courses.csv": readonly Record<string, unknown>[];
  "rounds.csv": readonly Record<string, unknown>[];
}

function parseFile<T>(
  file: keyof ExportFiles,
  records: readonly Record<string, unknown>[],
  schema: z.ZodType<T>,
  problems: string[],
): T[] {
  const rows: T[] = [];
  const seen = new Set<string>();
  records.forEach((record, index) => {
    const where = `${file} row ${String(index + 1)}`;
    const result = schema.safeParse(record);
    if (!result.success) {
      for (const issue of result.error.issues) problems.push(`${where}: ${issue.path.join(".") || "row"} ${issue.message}`);
      return;
    }
    const rowId = String(record["id"]);
    if (seen.has(rowId)) {
      problems.push(`${where}: duplicate id ${rowId}`);
      return;
    }
    seen.add(rowId);
    rows.push(result.data);
  });
  return rows;
}

/**
 * Validate every exported row.
 *
 * Args:
 *     files: Parsed CSV records per file; row numbers count data rows after
 *         the header, starting at 1.
 *
 * Returns:
 *     The typed export and one problem per invalid field or duplicate id. Any
 *     problem means the import must not run.
 */
export function parseExport(files: ExportFiles): { data: SupabaseExport; problems: string[] } {
  const problems: string[] = [];
  const data: SupabaseExport = {
    authUsers: parseFile("auth_users.csv", files["auth_users.csv"], authUserRow, problems),
    profiles: parseFile("profiles.csv", files["profiles.csv"], profileRow, problems),
    courses: parseFile("courses.csv", files["courses.csv"], courseRow, problems),
    memberships: parseFile("user_courses.csv", files["user_courses.csv"], membershipRow, problems),
    rounds: parseFile("rounds.csv", files["rounds.csv"], roundRow, problems),
  };
  return { data, problems };
}
