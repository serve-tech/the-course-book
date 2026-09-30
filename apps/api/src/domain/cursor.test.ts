import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cursorTimestamp, decodeCursor, encodeCursor } from "./cursor";

const key = z.object({ c: cursorTimestamp, i: z.uuid() });
const sample = { c: "2026-09-29T18:04:05.123456Z", i: "aaaaaaaa-0000-4000-8000-000000000001" };

describe("keyset cursors", () => {
  it("round-trips a key, keeping microseconds", () => {
    expect(decodeCursor(encodeCursor(sample), key)).toEqual(sample);
  });

  it("is URL-safe", () => {
    expect(encodeCursor({ text: "???>>>~~~" })).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it.each([
    ["garbage", "%%%not-a-cursor"],
    ["base64 that is not JSON", Buffer.from("hello").toString("base64url")],
    ["a key of another shape", encodeCursor({ a: 1 })],
    ["a millisecond timestamp", encodeCursor({ ...sample, c: "2026-09-29T18:04:05.123Z" })],
    ["a non-uuid id", encodeCursor({ ...sample, i: "user_123" })],
    ["an empty string", ""],
  ])("rejects %s", (_label, text) => {
    expect(decodeCursor(text, key)).toBeNull();
  });
});
