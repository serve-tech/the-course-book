import { describe, expect, it } from "vitest";
import { isAuthorizedParty } from "./azp";

const origins = ["https://coursebook.golf", "http://127.0.0.1:3000"];

describe("authorized party policy", () => {
  it.each([
    ["an allowed web origin", "https://coursebook.golf", true],
    ["another allowed origin", "http://127.0.0.1:3000", true],
    ["no azp (native clients)", undefined, true],
    ["a null azp", null, true],
    ["an unknown origin", "https://evil.example", false],
    ["an origin differing only by a trailing slash", "https://coursebook.golf/", false],
    ["an empty azp", "", false],
    ["a non-string azp", 42, false],
  ])("%s -> %s", (_label, azp, expected) => {
    expect(isAuthorizedParty(azp, origins)).toBe(expected);
  });
});
