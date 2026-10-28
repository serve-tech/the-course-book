import { describe, expect, it } from "vitest";
import { countLabel } from "./count-label";

describe("countLabel", () => {
  it.each([
    { label: "All", count: 100, expected: "All (100)" },
    { label: "Played", count: 2, expected: "Played (2)" },
    { label: "Not played", count: 0, expected: "Not played (0)" },
    { label: "Only Sam", count: 4, expected: "Only Sam (4)" },
  ])("puts $count in parentheses after $label", ({ label, count, expected }) => {
    expect(countLabel(label, count)).toBe(expected);
  });
});
