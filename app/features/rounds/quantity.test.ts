import { describe, expect, it } from "vitest";
import { normalizeQuantity } from "./quantity";

describe("normalizeQuantity", () => {
  it.each([
    [3.9, 0, 3],
    [-2, 0, 0],
    [Number.NaN, 1, 1],
    [Number.POSITIVE_INFINITY, 1, 1],
    [0, 1, 1],
  ])("normalizes %s with minimum %s to %s", (value, minimum, expected) => {
    expect(normalizeQuantity(value, minimum)).toBe(expected);
  });
});
