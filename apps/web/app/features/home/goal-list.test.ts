import { describe, expect, it } from "vitest";
import type { TopListStanding } from "@coursebook/domain/social/types";
import { chooseGoalList, GoalReason } from "./goal-list";

const standing = (type: string, scope: string, mine: number, size = 100): TopListStanding => ({
  list: { type, scope, title: type + " " + scope, size, source: "Test", sourceYear: 2026 },
  mine,
  friends: [],
});
const world = (mine: number) => standing("global", "GLOBAL", mine);
const publicList = (mine: number) => standing("usa_public", "USA_PUBLIC", mine);
const state = (scope: string, mine: number, size = 100) => standing("state", scope, mine, size);

describe("chooseGoalList", () => {
  it.each([
    {
      name: "the started home-state list beats a closer one",
      standings: [world(40), state("MI", 13)],
      homeState: "MI",
      expected: { scope: "MI", reason: GoalReason.HomeState },
    },
    {
      name: "a lower-case home state still matches",
      standings: [world(40), state("MI", 13)],
      homeState: "mi",
      expected: { scope: "MI", reason: GoalReason.HomeState },
    },
    {
      name: "an unstarted home state gives way to the closest started list",
      standings: [world(5), publicList(12), state("MI", 0)],
      homeState: "MI",
      expected: { scope: "USA_PUBLIC", reason: GoalReason.Closest },
    },
    {
      name: "share played decides, not the count",
      standings: [publicList(12), state("OR", 3, 10)],
      homeState: "",
      expected: { scope: "OR", reason: GoalReason.Closest },
    },
    {
      name: "an equal share goes to the list with more played",
      standings: [state("OR", 1, 10), publicList(10)],
      homeState: "",
      expected: { scope: "USA_PUBLIC", reason: GoalReason.Closest },
    },
    {
      name: "an exact tie keeps display order",
      standings: [world(10), publicList(10)],
      homeState: "",
      expected: { scope: "GLOBAL", reason: GoalReason.Closest },
    },
    {
      name: "a finished home-state list gives way to an unfinished one",
      standings: [world(3), state("RI", 4, 4)],
      homeState: "RI",
      expected: { scope: "GLOBAL", reason: GoalReason.Closest },
    },
    {
      name: "with nothing started, the home-state list invites a start",
      standings: [world(0), state("MI", 0)],
      homeState: "MI",
      expected: { scope: "MI", reason: GoalReason.HomeState },
    },
    {
      name: "with nothing started and no home state, the first list",
      standings: [world(0), publicList(0)],
      homeState: "",
      expected: { scope: "GLOBAL", reason: GoalReason.FirstList },
    },
    {
      name: "an empty list is never chosen",
      standings: [standing("usa", "USA", 0, 0), publicList(0)],
      homeState: "",
      expected: { scope: "USA_PUBLIC", reason: GoalReason.FirstList },
    },
  ])("$name", ({ standings, homeState, expected }) => {
    const goal = chooseGoalList(standings, homeState);
    expect(goal && { scope: goal.standing.list.scope, reason: goal.reason }).toEqual(expected);
  });

  it("has nothing to show without lists", () => {
    expect(chooseGoalList([], "MI")).toBeNull();
    expect(chooseGoalList([standing("usa", "USA", 0, 0)], "")).toBeNull();
  });
});
