import { describe, expect, it } from "vitest";
import { mainDestinations } from "./navigation";

describe("mainDestinations", () => {
  it.each([
    { mobile: false, labels: ["Home", "Courses", "Friends", "Profile"] },
    { mobile: true, labels: ["Home", "Courses", "Log a round", "Friends", "Profile"] },
  ])("mobile=$mobile", ({ mobile, labels }) => {
    expect(mainDestinations("golfer", mobile).map((item) => item.label)).toEqual(labels);
  });

  it.each([false, true])("keeps Activity and Timeline out, mobile=%s", (mobile) => {
    const labels = mainDestinations("golfer", mobile).map((item) => item.label);
    expect(labels).not.toContain("Activity");
    expect(labels).not.toContain("Timeline");
  });

  it("links Home to the ranking's page and Profile to the member", () => {
    const destinations = mainDestinations("golfer", false);
    expect(destinations.find((item) => item.label === "Home")?.to).toBe("/");
    expect(destinations.find((item) => item.label === "Profile")?.to).toBe("/u/golfer");
  });

  it("sends a visitor's Profile to sign-in instead of a private page", () => {
    expect(mainDestinations(null, false).find((item) => item.label === "Profile")?.to).toBeNull();
  });

  it("opens Log a round in place, with no URL", () => {
    const log = mainDestinations("golfer", true).find((item) => item.label === "Log a round");
    expect(log?.to).toBeNull();
    expect(log?.log).toBe(true);
  });
});
