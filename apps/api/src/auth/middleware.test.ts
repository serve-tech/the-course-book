import { describe, expect, it } from "vitest";
import { isBearerHeader } from "./middleware";

describe("isBearerHeader", () => {
  it.each([
    ["a bearer token", "Bearer header.payload.signature", true],
    ["another scheme", "Basic dXNlcjpwYXNz", false],
    ["a lowercase scheme, which Clerk would read as no token", "bearer header.payload.signature", false],
    ["a token without a scheme, which Clerk would read as a token", "header.payload.signature", false],
    ["the scheme alone", "Bearer", false],
    ["two spaces after the scheme", "Bearer  header.payload.signature", false],
    ["a second value after the token", "Bearer header.payload.signature extra", false],
  ])("judges %s", (_label, header, expected) => {
    expect(isBearerHeader(header)).toBe(expected);
  });
});
