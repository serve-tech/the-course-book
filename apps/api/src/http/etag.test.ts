import { describe, expect, it } from "vitest";
import { etagMatches } from "./etag";

describe("If-None-Match weak comparison", () => {
  it.each([
    ["the same strong tag", '"abc"', '"abc"', true],
    ["the weak form of the tag", 'W/"abc"', '"abc"', true],
    ["a strong header against a weak tag", '"abc"', 'W/"abc"', true],
    ["one tag in a list", '"old", W/"abc"', '"abc"', true],
    ["the wildcard", "*", '"abc"', true],
    ["a different tag", '"old"', '"abc"', false],
    ["no header", undefined, '"abc"', false],
    ["an empty header", "", '"abc"', false],
  ])("%s", (_label, header, etag, expected) => {
    expect(etagMatches(header, etag)).toBe(expected);
  });
});
