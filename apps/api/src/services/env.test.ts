import { describe, expect, it } from "vitest";
import { parseApiEnv } from "./env";

describe("API environment", () => {
  it("applies defaults", () => {
    expect(parseApiEnv({})).toEqual({
      PORT: 3001,
      WEB_ORIGINS: [],
      PUBLIC_WEB_URL: "https://coursebook.golf",
      MIN_IOS_VERSION: "0.0.0",
      MIN_ANDROID_VERSION: "0.0.0",
    });
  });

  it("splits and trims web origins", () => {
    expect(parseApiEnv({ WEB_ORIGINS: "https://coursebook.golf, https://www.coursebook.golf ,," }).WEB_ORIGINS).toEqual([
      "https://coursebook.golf",
      "https://www.coursebook.golf",
    ]);
  });

  it.each([
    ["a trailing slash", { WEB_ORIGINS: "https://coursebook.golf/" }],
    ["a path", { WEB_ORIGINS: "https://coursebook.golf/app" }],
    ["a malformed version", { MIN_IOS_VERSION: "1.0" }],
    ["a JWT key that is not a PEM public key", { CLERK_JWT_KEY: "abc" }],
    ["a port out of range", { PORT: "70000" }],
  ])("rejects %s", (_label, source) => {
    expect(() => parseApiEnv(source)).toThrow();
  });
});
