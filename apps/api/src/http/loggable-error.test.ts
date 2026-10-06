import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";
import { describe, expect, it } from "vitest";
import { AppError, ErrorCode } from "../services/errors";
import { loggableError } from "./loggable-error";

const EMAIL = "member@example.com";

/** A unique violation as pg reports it, with the row's values in `detail`. */
function uniqueViolation(): pg.DatabaseError {
  const error = new pg.DatabaseError('duplicate key value violates unique constraint "users_username_lower_idx"', 120, "error");
  Object.assign(error, {
    severity: "ERROR",
    code: "23505",
    detail: `Key (lower(username))=(golfer_1) already exists. ${EMAIL}`,
    hint: `Check ${EMAIL}`,
    where: `row ${EMAIL}`,
    internalQuery: `select '${EMAIL}'`,
    schema: "public",
    table: "users",
    constraint: "users_username_lower_idx",
    routine: "_bt_check_unique",
  });
  return error;
}

const failedInsert = () =>
  new DrizzleQueryError(
    'insert into "users" ("id", "username", "email") values ($1, $2, $3)',
    ["user_1", "golfer_1", EMAIL],
    uniqueViolation(),
  );

describe("loggableError", () => {
  it("keeps a failed query's SQL and the driver's cause, never its parameters or row values", () => {
    const logged = loggableError(failedInsert());
    expect(JSON.stringify(logged)).not.toContain(EMAIL);
    expect(JSON.stringify(logged)).not.toContain("golfer_1");
    expect(logged).toMatchObject({
      message: "Failed query",
      query: 'insert into "users" ("id", "username", "email") values ($1, $2, $3)',
      cause: {
        message: 'duplicate key value violates unique constraint "users_username_lower_idx"',
        code: "23505",
        constraint: "users_username_lower_idx",
        table: "users",
        routine: "_bt_check_unique",
      },
    });
    expect(logged.cause).not.toHaveProperty("detail");
  });

  it("keeps stack frames but not the header that repeats the message", () => {
    const logged = loggableError(failedInsert());
    expect(logged.stack?.length).toBeGreaterThan(0);
    expect(logged.stack?.every((frame) => frame.startsWith("at "))).toBe(true);
  });

  it("walks an AppError's cause chain and keeps its status and code", () => {
    const clerk = Object.assign(new Error("Clerk unavailable"), { status: 503, code: "ECONNRESET" });
    const error = new AppError(502, ErrorCode.AccountDeletionIncomplete, "Your data is deleted…", { cause: clerk });
    expect(loggableError(error)).toMatchObject({
      name: "AppError",
      status: 502,
      code: "account_deletion_incomplete",
      cause: { name: "Error", message: "Clerk unavailable", status: 503, code: "ECONNRESET" },
    });
  });

  it("describes each member of an AggregateError", () => {
    const error = new AggregateError([Object.assign(new Error("connect ECONNREFUSED ::1:5432"), { code: "ECONNREFUSED" })], "");
    expect(loggableError(error).errors).toEqual([expect.objectContaining({ message: "connect ECONNREFUSED ::1:5432", code: "ECONNREFUSED" })]);
  });

  it.each([
    ["a string, such as an abort reason", "Client connection prematurely closed.", { name: "string", message: "Client connection prematurely closed." }],
    ["undefined", undefined, { name: "undefined", message: "undefined" }],
    ["a plain object, whose fields could be anything", { email: EMAIL }, { name: "object", message: "(a non-Error object)" }],
    ["null", null, { name: "null", message: "null" }],
  ])("describes %s that was thrown", (_label, value, expected) => {
    expect(loggableError(value)).toEqual(expected);
  });

  it("stops at a cyclic cause chain", () => {
    const error = new Error("loop");
    error.cause = error;
    let depth = 0;
    for (let logged = loggableError(error).cause; logged; logged = logged.cause) depth += 1;
    expect(depth).toBe(8);
  });

  it("drops the frames when the message changed after the stack was captured", () => {
    const error = new Error("original");
    expect(error.stack).toContain("original");
    error.message = `changed ${EMAIL}`;
    expect(loggableError(error)).not.toHaveProperty("stack");
  });
});
