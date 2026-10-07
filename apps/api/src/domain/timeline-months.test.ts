import { describe, expect, it } from "vitest";
import { monthWindow } from "./timeline-months";

describe("monthWindow", () => {
  it.each([
    { name: "an empty page", playedOns: [], expected: { dated: null, undated: false } },
    { name: "one date", playedOns: ["2026-09-14"], expected: { dated: { from: "2026-09-01", until: "2026-10-01" }, undated: false } },
    {
      name: "several months in timeline order",
      playedOns: ["2026-10-02", "2026-09-30", "2026-08-01"],
      expected: { dated: { from: "2026-08-01", until: "2026-11-01" }, undated: false },
    },
    {
      name: "dates in any order",
      playedOns: ["2025-03-09", "2026-01-31", "2025-11-15"],
      expected: { dated: { from: "2025-03-01", until: "2026-02-01" }, undated: false },
    },
    { name: "December", playedOns: ["2025-12-31"], expected: { dated: { from: "2025-12-01", until: "2026-01-01" }, undated: false } },
    {
      name: "dated and undated rounds",
      playedOns: ["2015-08-01", null, null],
      expected: { dated: { from: "2015-08-01", until: "2015-09-01" }, undated: true },
    },
    { name: "only undated rounds", playedOns: [null], expected: { dated: null, undated: true } },
  ])("covers $name", ({ playedOns, expected }) => {
    expect(monthWindow(playedOns)).toEqual(expected);
  });
});
