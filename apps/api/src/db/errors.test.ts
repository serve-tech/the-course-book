import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { isUniqueViolation } from "./errors";

const databaseError = (code: string, constraint: string | undefined) =>
  Object.assign(new pg.DatabaseError("duplicate key value violates unique constraint", 100, "error"), { code, constraint });

const wrapped = (cause: unknown) => new DrizzleQueryError("insert into users …", [], cause instanceof Error ? cause : undefined);

describe("isUniqueViolation", () => {
  it.each([
    ["the driver's error", databaseError("23505", "users_username_lower_idx"), true],
    ["the driver's error wrapped by Drizzle", wrapped(databaseError("23505", "users_username_lower_idx")), true],
    ["the wrapped error wrapped again", new Error("outer", { cause: wrapped(databaseError("23505", "users_username_lower_idx")) }), true],
    ["a violation of another constraint", wrapped(databaseError("23505", "users_pkey")), false],
    ["another SQLSTATE on the same index", wrapped(databaseError("23503", "users_username_lower_idx")), false],
    ["an error that only mentions the index", new Error("users_username_lower_idx 23505"), false],
    ["a non-Error", "23505", false],
  ])("judges %s", (_label, error, expected) => {
    expect(isUniqueViolation(error, "users_username_lower_idx")).toBe(expected);
  });

  it("stops at a cyclic cause chain", () => {
    const error = new Error("loop");
    error.cause = error;
    expect(isUniqueViolation(error, "users_username_lower_idx")).toBe(false);
  });
});
