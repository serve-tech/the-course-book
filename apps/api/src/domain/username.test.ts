import { describe, expect, it } from "vitest";
import { isValidUsername } from "./username";

describe("username rule", () => {
  it.each(["abc", "golfer_99", "A1_", "x".repeat(24)])("accepts %s", (value) => {
    expect(isValidUsername(value)).toBe(true);
  });

  it.each(["ab", "x".repeat(25), "has space", "dash-name", "dot.name", "émile", ""])(
    "rejects %s",
    (value) => {
      expect(isValidUsername(value)).toBe(false);
    },
  );
});
