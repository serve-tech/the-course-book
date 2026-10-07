import { describe, expect, it } from "vitest";
import { courseSchema, RegionFilter } from "@coursebook/domain/catalog/course";
import { coursesLabel, RANKING_TABS, rankingRows, rankingTabLabel, roundsLabel } from "./ranking";

const row = (name: string, location: string) => ({ course: courseSchema.parse({ id: name, name, location }) });
const rows = [
  row("Crystal Downs", "Frankfort, MI, USA"),
  row("St Andrews Old", "St Andrews, Scotland"),
  row("Pine Valley", "Pine Valley, NJ, USA"),
  row("Oakland Hills", "Bloomfield Hills, MI, USA"),
];
const names = (kept: readonly { course: { name: string } }[]) => kept.map(({ course }) => course.name);

describe("rankingTabLabel", () => {
  it("names the tabs in order like the Courses page", () => {
    expect(RANKING_TABS.map((tab) => rankingTabLabel(tab, "MI"))).toEqual(["All", "USA", "International", "Best in Michigan"]);
  });

  it("names the state tab generically before a state is chosen", () => {
    expect(rankingTabLabel(RegionFilter.State, "")).toBe("Best in State");
  });
});

describe("rankingRows", () => {
  it.each([
    { region: RegionFilter.All, state: "", query: "", expected: ["Crystal Downs", "St Andrews Old", "Pine Valley", "Oakland Hills"] },
    { region: RegionFilter.USA, state: "", query: "", expected: ["Crystal Downs", "Pine Valley", "Oakland Hills"] },
    { region: RegionFilter.World, state: "", query: "", expected: ["St Andrews Old"] },
    { region: RegionFilter.State, state: "MI", query: "", expected: ["Crystal Downs", "Oakland Hills"] },
    { region: RegionFilter.State, state: "", query: "", expected: [] },
    { region: RegionFilter.All, state: "", query: "  hills ", expected: ["Oakland Hills"] },
    { region: RegionFilter.All, state: "", query: "SCOTLAND", expected: ["St Andrews Old"] },
    { region: RegionFilter.State, state: "MI", query: "crystal", expected: ["Crystal Downs"] },
  ])("keeps $expected for $region / '$state' / '$query'", ({ region, state, query, expected }) => {
    expect(names(rankingRows(rows, { region, state, query }))).toEqual(expected);
  });

  it("keeps each row's extra fields", () => {
    const ranked = [{ ...row("Pine Valley", "Pine Valley, NJ, USA"), rank: 7 }];
    expect(rankingRows(ranked, { region: RegionFilter.USA, state: "", query: "" })[0]?.rank).toBe(7);
  });
});

describe("count labels", () => {
  it.each([
    [1, "1 round", "1 course"],
    [3, "3 rounds", "3 courses"],
    [0, "0 rounds", "0 courses"],
  ])("%i reads as '%s' and '%s'", (count, rounds, courses) => {
    expect(roundsLabel(count)).toBe(rounds);
    expect(coursesLabel(count)).toBe(courses);
  });
});
