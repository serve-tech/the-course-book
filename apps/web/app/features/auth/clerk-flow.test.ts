import { describe, expect, it } from "vitest";
import { isClerkFlowHash } from "./clerk-flow";

describe("isClerkFlowHash", () => {
  it.each([
    ["#/sso-callback", true],
    ["#/create/sso-callback?after_sign_in_url=x", true],
    ["#/create/continue", true],
    ["#/factor-one", true],
    ["", false],
    ["#", false],
    ["#top", false],
    ["#course-12", false],
  ])("%j → %s", (hash, expected) => {
    expect(isClerkFlowHash(hash)).toBe(expected);
  });
});
