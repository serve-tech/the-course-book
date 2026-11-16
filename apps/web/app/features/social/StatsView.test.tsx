import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import { stateOptions } from "@coursebook/domain/catalog/geography";
import type { MemberListRow } from "@coursebook/domain/friends/types";
import { StatsView } from "./StatsView";
import { PLACES_SHOWN, type PublishedEntry } from "./stats";

const member = { username: "josh", displayName: "Josh Linneburg" };

const row = (id: string, name: string, rank: number, place: { state?: string; country?: string }): MemberListRow => ({
  course: courseSchema.parse({ id, name, location: "", country: place.country ?? "USA", state: place.state ?? "" }),
  rank,
  onMyList: false,
  played: 0,
  lastPlayedOn: null,
  myRank: null,
});

const entry = (type: string, scope: string, courseId: string, rank: number): PublishedEntry => ({ type, scope, courseId, rank });

/** Bandon is on the national lists; Franklin Hills only on Michigan's; the muni on none. */
const rows = [
  row("bt", "Bandon Trails", 1, { state: "OR" }),
  row("oh", "Oakland Hills", 2, { state: "MI" }),
  row("fh", "Franklin Hills", 3, { state: "MI" }),
  row("p2", "Pinehurst No. 2", 4, { state: "NC" }),
  row("muni", "The Muni", 5, { state: "MI" }),
];

const entries: PublishedEntry[] = [
  entry("usa", "USA", "pv", 1),
  entry("usa", "USA", "oh", 20),
  entry("usa", "USA", "p2", 32),
  entry("usa", "USA", "bt", 61),
  entry("global", "GLOBAL", "p2", 20),
  entry("usa_public", "USA_PUBLIC", "bt", 11),
  entry("world", "WORLD", "old", 1),
  entry("state", "MI", "cd", 1),
  entry("state", "MI", "oh", 2),
  entry("state", "MI", "fh", 16),
  entry("state", "OR", "bt", 3),
];

const show = (shown: MemberListRow[] = rows, self = true) =>
  render(
    <MemoryRouter>
      <StatsView member={member} self={self} rows={shown} entries={entries} />
    </MemoryRouter>,
  );

const section = (name: string | RegExp) => screen.getByRole("region", { name });
const items = (name: string | RegExp) => within(section(name)).getAllByRole("listitem");

beforeEach(() => {
  // jsdom has no layout, so it has no scrollIntoView; "Show fewer" calls it.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

describe("StatsView", () => {
  it("shows each national Top 100 with its progress, opening that list with the member's ticks", () => {
    show();
    expect(items("Top 100s").map((item) => item.textContent)).toEqual([
      "World Top 1001 / 1Your top-ranked: #4 Pinehurst No. 2",
      "USA Top 1003 / 4Your top-ranked: #1 Bandon Trails",
      "USA Public Top 1001 / 1Your top-ranked: #1 Bandon Trails",
      "International Top 1000 / 1",
    ]);
    expect(screen.getByRole("link", { name: "USA Top 100: 3 of 4 played" })).toHaveAttribute("href", "/u/josh/lists/usa");
    expect(screen.getByRole("link", { name: "International Top 100: 0 of 1 played" })).toHaveAttribute("href", "/u/josh/lists/international");
  });

  it("says in words how a state's courses relate to its list, so the two numbers can't be confused", () => {
    show();
    const [michigan, oregon, carolina] = items("States");
    expect(michigan).toHaveTextContent("Michigan3 courses2 of your 3 are on Best in Michigan (3 courses)Your top-ranked: #2 Oakland Hills");
    expect(oregon).toHaveTextContent("Oregon1 courseIt's on Best in Oregon (1 course)Your top-ranked: #1 Bandon Trails");
    // North Carolina has no published list here: the courses and the top-ranked course, no progress.
    expect(carolina).toHaveTextContent("North Carolina1 courseYour top-ranked: #4 Pinehurst No. 2");
    expect(within(carolina as HTMLElement).queryByRole("link", { name: /^North Carolina/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Michigan: 3 courses. 2 of your 3 are on Best in Michigan (3 courses)" })).toHaveAttribute("href", "/u/josh/lists/state-mi");
  });

  it("opens the top-ranked course's page from its name, apart from the row's own link", () => {
    show();
    const [michigan] = items("States");
    expect(within(michigan as HTMLElement).getByRole("link", { name: "Oakland Hills" })).toHaveAttribute("href", "/courses/oh");
  });

  it("lists countries only when there is more than one", () => {
    show();
    expect(screen.queryByRole("region", { name: "Countries" })).toBeNull();
    cleanup();

    show([...rows, row("old", "Old Course", 6, { country: "Scotland" })]);
    expect(items("Countries").map((item) => item.textContent)).toEqual(["USA5 coursesYour top-ranked: #1 Bandon Trails", "Scotland1 courseYour top-ranked: #6 Old Course"]);
  });

  it("starts a long list of states at the first few, with a button for the rest", () => {
    const many = stateOptions.slice(0, PLACES_SHOWN + 5).map((state, index) => row("s" + String(index), "Course " + state.code, index + 1, { state: state.code }));
    show(many);
    expect(items("States")).toHaveLength(PLACES_SHOWN);

    fireEvent.click(screen.getByRole("button", { name: "Show all " + String(many.length) + " states" }));
    expect(items("States")).toHaveLength(many.length);

    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(fewer);
    expect(items("States")).toHaveLength(PLACES_SHOWN);
  });

  it("shows a short list of states whole, with no button", () => {
    show();
    expect(screen.queryByRole("button", { name: /^Show/ })).toBeNull();
  });

  it("compares the ranking with the lists: the hidden gem and the biggest disagreement", () => {
    show();
    const versus = section("Your ranking vs the lists");
    expect(versus).toHaveTextContent("Hidden gemFranklin HillsYour #3, and on no national list. It's #16 on Best in Michigan.");
    expect(versus).toHaveTextContent("Biggest disagreementBandon TrailsUSA Top 100 has it 3rd of your 3 courses on that list. You have it 1st.");
    expect(within(versus).getByRole("link", { name: "Franklin Hills" })).toHaveAttribute("href", "/courses/fh");
    expect(within(versus).getByRole("link", { name: "Best in Michigan" })).toHaveAttribute("href", "/u/josh/lists/state-mi");
  });

  it("names the best course played on each national list, by the list's rank", () => {
    show();
    expect(items("The best you've played").map((item) => item.textContent)).toEqual([
      "#20Pinehurst No. 2on the World Top 100",
      "#20Oakland Hillson the USA Top 100",
      "#11Bandon Trailson the USA Public Top 100",
    ]);
  });

  it("speaks of a friend as they", () => {
    show(rows, false);
    expect(items("Top 100s")[1]).toHaveTextContent("Their top-ranked: #1 Bandon Trails");
    expect(items("States")[0]).toHaveTextContent("2 of their 3 are on Best in Michigan (3 courses)");
    expect(section("Their ranking vs the lists")).toHaveTextContent("USA Top 100 has it 3rd of their 3 courses on that list. They have it 1st.");
    expect(section("The best they've played")).toBeVisible();
  });

  it.each([
    [true, "Rank a course and your progress through the lists shows up here."],
    [false, "Josh Linneburg hasn't ranked any courses yet."],
  ])("shows an empty ranking as a note over the Top 100s at zero (own profile: %s)", (self, note) => {
    show([], self);
    expect(screen.getByText(note)).toBeVisible();
    expect(items("Top 100s")).toHaveLength(4);
    expect(screen.queryByRole("region", { name: "States" })).toBeNull();
    expect(screen.queryByRole("region", { name: /vs the lists/ })).toBeNull();
    expect(screen.queryByRole("region", { name: /^The best/ })).toBeNull();
  });
});
