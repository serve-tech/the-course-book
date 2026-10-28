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
      labels: ["Home", "My ranking", "My lists", "Courses", "Activity", "Friends"],
    },
    {
      layout: LayoutMode.CourseFirst,
      mobile: true,
      labels: ["Home", "My ranking", "Log a round", "Courses", "Friends"],
    },
  ])("$layout, mobile=$mobile", ({ layout, mobile, labels }) => {
    expect(
      mainDestinations(layout, "golfer", mobile).map((item) => item.label),
    ).toEqual(labels);
  });

  it("keeps the Classic profile link attached to the member", () => {
    const links = mainDestinations(LayoutMode.Classic, "a golfer", true);
    expect(links.at(-1)?.to).toBe("/u/a%20golfer");
  });

  it.each([LayoutMode.Classic, LayoutMode.CourseFirst])(
    "gives Log a round no URL in %s, so it opens over the current page",
    (layout) => {
      const log = mainDestinations(layout, "golfer", true).find((item) => item.log);
      expect(log).toMatchObject({ label: "Log a round", to: null });
    },
  );

  it("points the preview's ranking and lists at the member's profile", () => {
    const urls = (mobile: boolean) =>
      Object.fromEntries(
        mainDestinations(LayoutMode.CourseFirst, "a golfer", mobile).map(
          (item) => [item.label, item.to],
        ),
      );
    expect(urls(false)).toMatchObject({
      Home: "/",
      "My ranking": "/u/a%20golfer/ranking",
      "My lists": "/u/a%20golfer/lists",
    });
    expect(urls(true)).toMatchObject({
      "My ranking": "/u/a%20golfer/ranking",
    });
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
