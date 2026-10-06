import { isClerkAPIResponseError } from "@clerk/backend/errors";
import { DrizzleQueryError } from "drizzle-orm";
import pg from "pg";

/**
 * What the API logs about a failure: enough to diagnose it, never the data
 * a query carried.
 *
 * Drizzle's `DrizzleQueryError` message is `Failed query: <sql>\nparams:
 * <values>`, and the values include members' email addresses (provisioning
 * writes them). Postgres puts key values in a unique violation's `detail`
 * ("Key (lower(username))=(…) already exists."). Logging the whole error
 * printed both, so every server-side error log goes through
 * `loggableError` first.
 */

/** A failure reduced to fields that are safe to log; `cause` and `errors` follow the original. */
export interface LoggedError {
  name: string;
  message: string;
  /** `AppError` code, Postgres SQLSTATE or Node system error code, e.g. `ECONNREFUSED`. */
  code?: string;
  /** HTTP status of an `AppError` or an API client error, e.g. Clerk's. */
  status?: number;
  /** Clerk's trace id for a Backend API error, for a support request. */
  clerkTraceId?: string;
  /** The `code` of each error in a Clerk Backend API response, e.g. `resource_not_found`. */
  clerkCodes?: string[];
  /** SQL text of a failed Drizzle query, without its parameters. */
  query?: string;
  constraint?: string;
  table?: string;
  column?: string;
  routine?: string;
  /** Stack frames only; the header line repeats the message. */
  stack?: string[];
  /** The members of an `AggregateError`, e.g. one connection failure per address. */
  errors?: LoggedError[];
  cause?: LoggedError;
}

/** Causes deeper than this are dropped, which also ends a cyclic chain. */
const MAX_DEPTH = 8;

/** The Postgres error fields that name things rather than quote values. */
const DATABASE_FIELDS = ["code", "constraint", "table", "column", "routine"] as const;

/**
 * Reduce an error and its `cause` chain to fields that are safe to log.
 *
 * - `DrizzleQueryError`: the SQL text is kept as `query`; the parameters are
 *   dropped, and so is the message, which repeats them.
 * - Postgres errors (`pg.DatabaseError`): `message`, `code`, `constraint`,
 *   `table`, `column` and `routine` are kept; `detail`, `hint`, `where` and
 *   `internalQuery` are dropped because they can quote row values. Note
 *   that a data exception's message (SQLSTATE class 22, e.g. `invalid input
 *   syntax for type uuid: "…"`) quotes the rejected input; request
 *   validation keeps such input from reaching the database.
 * - Clerk Backend API errors: additionally the trace id and each error's
 *   `code`, not their messages or `meta`, which can name the user.
 * - Other errors: `name`, `message`, a string `code` and a numeric `status`
 *   (for `AppError` and API client errors).
 * - Non-`Error` values (for example an abort reason string): their type and,
 *   for primitives, their text.
 *
 * Args:
 *     error: Anything thrown or rejected.
 *
 * Returns:
 *     A plain, JSON-serializable description.
 *
 * Example:
 *     >>> loggableError(new DrizzleQueryError("insert into users …", ["a@example.com"], cause))
 *     { name: "Error", message: "Failed query", query: "insert into users …", cause: { … } }
 */
export function loggableError(error: unknown): LoggedError {
  return describe(error, 0);
}

function describe(error: unknown, depth: number): LoggedError {
  if (!(error instanceof Error)) return describeValue(error);
  const logged: LoggedError = { name: error.name, message: error.message };
  if (error instanceof DrizzleQueryError) {
    logged.message = "Failed query";
    logged.query = error.query;
  } else if (error instanceof pg.DatabaseError) {
    for (const field of DATABASE_FIELDS) {
      const value = error[field];
      if (value !== undefined) logged[field] = value;
    }
  } else {
    if ("code" in error && typeof error.code === "string") logged.code = error.code;
    if ("status" in error && typeof error.status === "number") logged.status = error.status;
    if (isClerkAPIResponseError(error)) {
      if (error.clerkTraceId) logged.clerkTraceId = error.clerkTraceId;
      logged.clerkCodes = error.errors.map((item) => item.code);
    }
  }
  const frames = stackFrames(error);
  if (frames.length) logged.stack = frames;
  if (depth >= MAX_DEPTH) return logged;
  if (error instanceof AggregateError) logged.errors = error.errors.map((member: unknown) => describe(member, depth + 1));
  if (error.cause !== undefined) logged.cause = describe(error.cause, depth + 1);
  return logged;
}

/** A thrown non-`Error`: primitives by their text, objects only by their type (their fields could hold anything). */
function describeValue(value: unknown): LoggedError {
  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
    case "bigint":
    case "undefined":
      return { name: typeof value, message: String(value) };
    default:
      return value === null ? { name: "null", message: "null" } : { name: typeof value, message: `(a non-Error ${typeof value})` };
  }
}

/**
 * The stack's frames, without the header.
 *
 * The header is `<name>: <message>` and may span lines (a Drizzle message
 * puts the parameters on its second line), so everything up to the end of
 * the message is skipped. When the message cannot be found in the stack (it
 * was changed after the stack was captured), no frames are returned rather
 * than risk logging it.
 */
function stackFrames(error: Error): string[] {
  const stack = error.stack ?? "";
  let rest = stack;
  if (error.message) {
    const start = stack.indexOf(error.message);
    if (start < 0) return [];
    rest = stack.slice(start + error.message.length);
  }
  return rest
    .split("\n")
    .filter((line) => /^\s+at /.test(line))
    .map((line) => line.trim());
}
