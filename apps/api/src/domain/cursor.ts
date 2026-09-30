import { z } from "zod";

/**
 * Opaque keyset cursors for paged reads (timeline, feed).
 *
 * A cursor is the sort key of the last row a client received, as base64url
 * JSON. Clients pass it back unchanged; the server validates it with the
 * page's schema before it reaches SQL. Timestamps travel as the text
 * Postgres produced (microseconds, UTC) because a JavaScript Date keeps only
 * milliseconds: rows logged within the same millisecond would otherwise be
 * skipped or repeated at a page boundary.
 *
 * Cursors hold sort keys only (dates, timestamps, row uuids), never a member
 * id, since API responses must not expose one.
 */

/** Postgres `to_char` pattern for timestamps in cursors: UTC with microseconds. */
export const CURSOR_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';

/** A timestamp as `CURSOR_TIMESTAMP_FORMAT` renders it. */
export const cursorTimestamp = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);

/** Encode a sort key as an opaque cursor. */
export function encodeCursor(key: unknown): string {
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

/**
 * Decode a cursor produced by `encodeCursor`.
 *
 * Returns:
 *     The validated key, or null when the text is not a cursor of this
 *     shape (tampered, truncated, or from another page type). Callers turn
 *     null into 400 `validation_failed`.
 */
export function decodeCursor<T>(text: string, schema: z.ZodType<T>): T | null {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(text, "base64url").toString("utf8"));
  } catch {
    // Not base64url JSON: an invalid cursor, reported by the caller as 400.
    return null;
  }
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
