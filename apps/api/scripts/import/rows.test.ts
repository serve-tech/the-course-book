import { describe, expect, it } from "vitest";
import { parseCSV } from "../../src/domain/opengolf";
import { parseExport, type ExportFiles } from "./rows";

const USER = "6f1c2a3b-4d5e-4f60-8a71-b2c3d4e5f607";
const COURSE = "0e5f1c2a-7b1d-4c55-9a51-000000000001";
const HASH = "$2a$10$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ01234";

/** Export files as psql's `\copy ... csv header` writes them. */
const files = (overrides: Partial<Record<keyof ExportFiles, string>> = {}): ExportFiles => {
  const text: Record<keyof ExportFiles, string> = {
    "auth_users.csv": `id,email,encrypted_password\n${USER},one@example.com,${HASH}\n`,
    "profiles.csv": `id,display_name,avatar_url,created_at,email,username\n${USER},One,,2026-09-14 19:08:59.566482+00,one@example.com,golfer\n`,
    "courses.csv": `id,name,city,state,country,logo_url,website_url,is_custom,created_at\n${COURSE},"Backyard Nine, North",Hometown,OH,USA,,,t,2026-09-14 19:08:59+00\n`,
    "user_courses.csv": `id,user_id,course_id,times_played,personal_rank,first_played,last_played,notes,created_at,updated_at\n11111111-1111-4111-8111-111111111111,${USER},${COURSE},2,1,,,,2026-09-14 19:08:59.566482+00,2026-09-14 19:08:59.566482+00\n`,
    "rounds.csv": `id,user_id,course_id,played_at,score,tees,notes,created_at\n22222222-2222-4222-8222-222222222222,${USER},${COURSE},2026-06-01,84,Blue,"windy\nall day",2026-06-01 20:00:00+00\n`,
    ...overrides,
  };
  return Object.fromEntries(Object.entries(text).map(([name, csv]) => [name, parseCSV(csv)])) as unknown as ExportFiles;
};

describe("export rows", () => {
  it("reads psql's CSV values into typed rows", () => {
    const { data, problems } = parseExport(files());
    expect(problems).toEqual([]);
    expect(data.authUsers).toEqual([{ id: USER, email: "one@example.com", encrypted_password: HASH }]);
    expect(data.profiles[0]).toEqual({ id: USER, email: "one@example.com", username: "golfer", display_name: "One", avatar_url: null });
    expect(data.courses[0]).toMatchObject({ name: "Backyard Nine, North", is_custom: true, logo_url: null, created_at: "2026-09-14 19:08:59+00" });
    expect(data.memberships[0]).toMatchObject({ personal_rank: 1, times_played: 2, notes: null });
    expect(data.rounds[0]).toMatchObject({ played_at: "2026-06-01", score: 84, tees: "Blue", notes: "windy\nall day" });
  });

  it.each<[string, Partial<Record<keyof ExportFiles, string>>, string]>([
    ["a malformed id", { "rounds.csv": "id,user_id,course_id,played_at,score,tees,notes,created_at\nnot-a-uuid,,,,,,,\n" }, "rounds.csv row 1: id"],
    ["an impossible date", { "rounds.csv": `id,user_id,course_id,played_at,score,tees,notes,created_at\n22222222-2222-4222-8222-222222222222,${USER},${COURSE},2026-02-30,,,,\n` }, "rounds.csv row 1: played_at must be a calendar date"],
    ["a non-numeric rank", { "user_courses.csv": `id,user_id,course_id,times_played,personal_rank,notes,created_at\n11111111-1111-4111-8111-111111111111,${USER},${COURSE},,first,,\n` }, "user_courses.csv row 1: personal_rank must be a whole number"],
    ["a missing column", { "profiles.csv": `id,email\n${USER},one@example.com\n` }, "profiles.csv row 1: username"],
    ["a blank course name", { "courses.csv": `id,name,city,state,country,logo_url,website_url,is_custom,created_at\n${COURSE}, ,,,,,,f,\n` }, "courses.csv row 1: name must not be empty"],
  ])("reports %s with its file and row", (_label, override, expected) => {
    const { problems } = parseExport(files(override));
    expect(problems.join("\n")).toContain(expected);
  });

  it("reports a duplicate id", () => {
    const row = `${COURSE},Twice,,,,,,f,`;
    const { data, problems } = parseExport(files({ "courses.csv": `id,name,city,state,country,logo_url,website_url,is_custom,created_at\n${row}\n${row}\n` }));
    expect(problems).toEqual([`courses.csv row 2: duplicate id ${COURSE}`]);
    expect(data.courses).toHaveLength(1);
  });

  it("never echoes a password hash in a problem", () => {
    const { problems } = parseExport(files({ "auth_users.csv": `id,email,encrypted_password\nbad-id,one@example.com,${HASH}\n` }));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join("\n")).not.toContain(HASH);
  });
});
