import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { MemberListRow } from "@coursebook/domain/friends/types";
import { StatsView } from "./StatsView";

const member = { username: "josh", displayName: "Josh Linneburg" };

const row = (id: string, location: string, place: Record<string, unknown>, played = 0): MemberListRow => ({
  course: courseSchema.parse({ id, name: "Course " + id, location, ...place }),
  rank: 1,
  onMyList: false,
  played,
  lastPlayedOn: null,
  myRank: null,
});

const michigan = (id: string, played = 0) => row(id, "Detroit, MI, USA", { country: "USA", state: "MI" }, played);
const ohio = row("oh", "Columbus, OH, USA", { country: "USA", state: "OH" });
const oldCourse = row("old", "St Andrews, Scotland", { country: "Scotland", global: 3, world: 3 });

const show = (rows: MemberListRow[], self = true) =>
  render(
    <MemoryRouter>
      <StatsView member={member} self={self} rows={rows} />
    </MemoryRouter>,
  );

/** A breakdown's rows as they read: "Michigan 2 courses". */
const lines = (section: string) =>
  within(screen.getByRole("region", { name: new RegExp("^" + section) }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

afterEach(() => {
  cleanup();
});

describe("StatsView", () => {
  it("lists every state most courses first, each opening that state's view of the ranking", () => {
    show([ohio, michigan("a"), michigan("b"), oldCourse]);
    expect(lines("States")).toEqual(["Michigan 2 courses", "Ohio 1 course"]);
    expect(screen.getByRole("link", { name: "Michigan 2 courses" })).toHaveAttribute("href", "/r/josh?view=state-mi");
    expect(screen.getByRole("link", { name: "See the 2 states" })).toHaveAttribute("href", "#states");
  });

  it("lists countries only when there is more than one", () => {
    show([michigan("a"), oldCourse]);
    expect(lines("Countries")).toEqual(["USA 1 course", "Scotland 1 course"]);
    // No country has a view of the ranking to open.
    expect(screen.queryByRole("link", { name: /^Scotland/ })).toBeNull();
    expect(screen.getByRole("link", { name: "See the 2 countries" })).toHaveAttribute("href", "#countries");
    cleanup();

    show([michigan("a"), ohio]);
    expect(screen.queryByRole("region", { name: /^Countries/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /countries/ })).toBeNull();
  });

  it("counts the national Top 100s, each opening that list on the Lists tab", () => {
    show([michigan("a"), oldCourse]);
    expect(screen.getByRole("link", { name: "1 of the World Top 100" })).toHaveAttribute("href", "/u/josh/lists/world");
    expect(screen.getByRole("link", { name: "0 of the USA Top 100" })).toHaveAttribute("href", "/u/josh/lists/usa");
    expect(screen.getByRole("link", { name: "All lists" })).toHaveAttribute("href", "/u/josh/lists");
  });

  it("says nothing about rounds for a member without a course played twice", () => {
    show([michigan("a", 1), ohio]);
    expect(screen.queryByRole("heading", { name: "Most played" })).toBeNull();
    expect(screen.queryByText(/rounds/)).toBeNull();
  });

  it("names the most played course once one has a second round", () => {
    show([michigan("a", 1), michigan("b", 3)]);
    const section = screen.getByRole("region", { name: "Most played" });
    expect(section).toHaveTextContent("Course b");
    expect(section).toHaveTextContent("3 rounds");
  });

  it.each([
    [true, "Rank a course and the places you've played show up here."],
    [false, "Josh Linneburg hasn't ranked any courses yet."],
  ])("shows an empty ranking as zeros and a note (own profile: %s)", (self, note) => {
    show([], self);
    expect(screen.getByText(note)).toBeVisible();
    expect(screen.queryByRole("region", { name: /^States/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /^See the/ })).toBeNull();
  });
});
