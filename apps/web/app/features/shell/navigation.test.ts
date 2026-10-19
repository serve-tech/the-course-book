import { describe, expect, it } from "vitest";
import { LayoutMode } from "./layout-preview";
import { mainDestinations } from "./navigation";

describe("layout destinations", () => {
  it.each([
    {
      layout: LayoutMode.Classic,
      mobile: false,
      labels: ["Home", "Courses", "Friends", "Profile"],
    },
    {
      layout: LayoutMode.Classic,
      mobile: true,
      labels: ["Home", "Courses", "Log a round", "Friends", "Profile"],
    },
    {
      layout: LayoutMode.CourseFirst,
      mobile: false,
      labels: ["My ranking", "My lists", "Courses", "Activity", "Friends"],
    },
    {
      layout: LayoutMode.CourseFirst,
      mobile: true,
      labels: ["My ranking", "My lists", "Courses", "Activity", "Friends"],
    },
  ])("$layout, mobile=$mobile", ({ layout, mobile, labels }) => {
    expect(
      mainDestinations(layout, "golfer", mobile).map((item) => item.label),
    ).toEqual(labels);
  });

  it("keeps Classic profile and Log links attached to the member", () => {
    const links = mainDestinations(LayoutMode.Classic, "a golfer", true);
    expect(links.find((item) => item.log)?.to).toBe(
      "/u/a%20golfer/ranking?log=1",
    );
    expect(links.at(-1)?.to).toBe("/u/a%20golfer");
  });

  it.each([LayoutMode.Classic, LayoutMode.CourseFirst])(
    "offers sign-in for private destinations in %s",
    (layout) => {
      const links = mainDestinations(layout, null, true);
      expect(links[0]?.label).toBe("Home");
      expect(links.some((item) => item.to === null)).toBe(true);
      expect(links.some((item) => item.to?.startsWith("/u/"))).toBe(false);
    },
  );
});
