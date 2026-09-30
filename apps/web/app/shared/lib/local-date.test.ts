import { describe, expect, it } from "vitest";
import { localDate } from "./local-date";

describe("localDate", () => {
  it("formats the local calendar date with zero padding", () => {
    expect(localDate(new Date(2026, 0, 5, 23, 30))).toBe("2026-01-05");
    expect(localDate(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });
});
