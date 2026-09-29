import { describe, expect, it } from "vitest";
import { schemaMismatch } from "./preflight";

describe("schemaMismatch", () => {
  it.each<[string, number[], number[], string | null]>([
    ["matches", [1, 2, 3], [3, 1, 2], null],
    ["the deploy has not migrated yet", [1, 2, 3], [1, 2], "lacks 1 migration(s)"],
    ["the checkout is older than the database", [1, 2], [1, 2, 3], "has 1 migration(s) this checkout lacks"],
    ["both differ: missing wins, since deploying comes first", [1, 3], [1, 2], "lacks 1 migration(s)"],
  ])("%s", (_, known, applied, message) => {
    const mismatch = schemaMismatch(known, applied);
    if (message === null) expect(mismatch).toBeNull();
    else expect(mismatch).toContain(message);
  });
});
