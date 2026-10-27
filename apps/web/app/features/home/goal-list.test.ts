import { describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { TopListCourse, TopListStanding } from "@coursebook/domain/social/types";
import { chooseGoalList, goalChoices, GoalReason, upNext } from "./goal-list";

const standing = (type: string, scope: string, mine: number, size = 100): TopListStanding => ({
  list: { type, scope, title: type + " " + scope, size, source: "Test", sourceYear: 2026 },
  mine,
  friends: [],
});
const world = (mine: number) => standing("global", "GLOBAL", mine);
const usa = (mine: number) => standing("usa", "USA", mine);
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
    {
      name: "the member's pick beats every rule",
      standings: [usa(2), state("MI", 13)],
      homeState: "MI",
      chosen: "usa",
      expected: { scope: "USA", reason: GoalReason.Chosen },
    },
    {
      name: "a pick of another state's list holds",
      standings: [usa(2), state("MI", 13), state("OR", 1, 10)],
      homeState: "MI",
      chosen: "STATE-OR",
      expected: { scope: "OR", reason: GoalReason.Chosen },
    },
    {
      name: "a pick naming no list falls back to the rules",
      standings: [usa(2), state("MI", 13)],
      homeState: "MI",
      chosen: "state-zz",
      expected: { scope: "MI", reason: GoalReason.HomeState },
    },
  ])("$name", ({ standings, homeState, chosen, expected }: { standings: TopListStanding[]; homeState: string; chosen?: string; expected: unknown }) => {
    const goal = chooseGoalList(standings, homeState, chosen ?? null);
    expect(goal && { scope: goal.standing.list.scope, reason: goal.reason }).toEqual(expected);
  });

  it("has nothing to show without lists", () => {
    expect(chooseGoalList([], "MI")).toBeNull();
    expect(chooseGoalList([standing("usa", "USA", 0, 0)], "")).toBeNull();
  });
});

describe("goalChoices", () => {
  const lists = [world(5), usa(7), publicList(12), state("GA", 2, 30), state("MI", 13), state("OR", 3, 10), standing("state", "ZZ", 0, 0)];
  const scopes = (choices: TopListStanding[]) => choices.map((choice) => choice.list.scope);

  it("offers the national lists and the home state's", () => {
    expect(scopes(goalChoices(lists, "mi", chooseGoalList(lists, "MI")))).toEqual(["GLOBAL", "USA", "USA_PUBLIC", "MI"]);
  });

  it("keeps another state's list while it is the goal", () => {
    expect(scopes(goalChoices(lists, "MI", chooseGoalList(lists, "MI", "state-or")))).toEqual(["GLOBAL", "USA", "USA_PUBLIC", "MI", "OR"]);
  });

  it("leaves out empty lists and state lists without a home state", () => {
    expect(scopes(goalChoices(lists, "ZZ", null))).toEqual(["GLOBAL", "USA", "USA_PUBLIC"]);
  });
});

describe("upNext", () => {
  const entry = (id: string, rank: number, played: number, wantToPlay = false): TopListCourse => ({
    course: courseSchema.parse({ id, name: id, location: "" }),
    rank,
    played,
    wantToPlay,
    friendsPlayed: [],
  });

  it("puts Want to play first, then list order, and skips what was played", () => {
    const entries = [entry("a", 1, 2), entry("b", 2, 0), entry("c", 3, 0, true), entry("d", 4, 0), entry("e", 5, 0, true)];
    expect(upNext(entries, 3).map((next) => next.course.id)).toEqual(["c", "e", "b"]);
  });

  it("is empty when everything is played", () => {
    expect(upNext([entry("a", 1, 1)], 3)).toEqual([]);
  });
});
