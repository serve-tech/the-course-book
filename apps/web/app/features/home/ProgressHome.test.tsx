import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider, type LoaderFunction } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema, type Course } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { FeedItemType, type FeedItem, type TopListCourse, type TopListStanding } from "@coursebook/domain/social/types";
import { HOME_GOAL_LIST_KEY } from "../../shared/lib/storage";
import type { Shell } from "../../shared/ui/shell";
import { chooseGoalList } from "./goal-list";
import { ProgressHome } from "./ProgressHome";

const course = (id: string, name: string, fields: Partial<Course> = {}): Course =>
  courseSchema.parse({ id, name, location: "Somewhere, MI, USA", country: "USA", state: "MI", ...fields });
const pacific = course("pacific", "Pacific Dunes", { state: "OR" });
const trails = course("trails", "Bandon Trails", { state: "OR" });
const bethpage = course("bethpage", "Bethpage Black", { state: "NY", usa: 38 });
const rackham = course("rackham", "Rackham", { stateRank: 89 });

const dan = { username: "dan", displayName: "Dan Whitaker" };
const maya = { username: "maya", displayName: "Maya Castillo" };

const standing = (type: string, scope: string, title: string, mine: number, friends: TopListStanding["friends"] = []): TopListStanding => ({
  list: { type, scope, title, size: 100, source: "Test", sourceYear: 2026 },
  mine,
  friends,
});
const standings: TopListStanding[] = [
  standing("global", "GLOBAL", "World Top 100", 5),
  standing("usa", "USA", "USA Top 100", 7),
  standing("state", "MI", "Best in Michigan", 13, [{ member: dan, played: 20 }]),
  standing("state", "OR", "Best in Oregon", 2),
];
const entry = (subject: Course, rank: number, played: number, wantToPlay = false): TopListCourse => ({
  course: subject,
  rank,
  played,
  wantToPlay,
  friendsPlayed: rank === 1 ? [dan] : [],
});
const michigan: TopListCourse[] = [
  entry(course("crystal", "Crystal Downs"), 1, 0),
  entry(course("oakland", "Oakland Hills: South"), 2, 1),
  entry(course("dunes", "Dunes Club"), 3, 0),
  entry(course("kingsley", "Kingsley Club"), 4, 0, true),
  entry(course("arcadia", "Arcadia Bluffs"), 5, 0),
];
const rows: ListEntry[] = [
  { course: pacific, rank: 1, played: 2 },
  { course: trails, rank: 2, played: 1 },
];
const round = (id: string, member: FeedItem["member"], subject: Course, visit = 1): FeedItem => ({
  id,
  type: FeedItemType.Round,
  at: "2026-09-29T12:00:00Z",
  member,
  rounds: [{ id: "round-" + id, course: subject, playedOn: "2026-09-25", visit, rank: 5 }],
  count: 1,
});
const activity: FeedItem[] = [
  round("1", maya, trails),
  round("2", maya, trails, 2),
  round("3", dan, bethpage, 10),
  round("4", dan, rackham, 32),
  round("5", maya, pacific),
];

type Props = Parameters<typeof ProgressHome>[0];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
let shell: Shell;

beforeEach(() => {
  localStorage.clear();
  shell = { selectedState: "MI", onState: vi.fn(), notify: vi.fn(), searchFocus: vi.fn(), openAuth: vi.fn(), openLog: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const router of routers.splice(0)) router.dispose();
});

/**
 * Render Home under the shell outlet. `loader` lets a test hold Home's reload,
 * as when the member switches lists.
 */
function openHome(props: Partial<Props> = {}, loader?: LoaderFunction) {
  const lists = props.standings ?? standings;
  const homeState = props.homeState ?? "MI";
  const element = (
    <ProgressHome
      homeState={homeState}
      standings={lists}
      goal={chooseGoalList(lists, homeState)}
      goalCourses={michigan}
      activity={activity}
      rows={rows}
      username="golfer"
      {...props}
    />
  );
  const router = createMemoryRouter(
    [{ element: <Outlet context={shell} />, children: [{ path: "/", element, ...(loader ? { loader } : {}) }] }],
    { initialEntries: ["/"] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}

describe("progress home", () => {
  it("leads with progress on the tracked list and one way to log a round", () => {
    openHome();
    const hero = screen.getByRole("region", { name: "Best in Michigan" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Best in Michigan");
    expect(hero).toHaveTextContent("13of 100 played · 87 to go");
    expect(within(hero).getByRole("progressbar", { name: "Best in Michigan played" })).toHaveAttribute("aria-valuenow", "13");
    expect(hero).toHaveTextContent("Dan Whitaker has played 20.");
    expect(screen.getAllByRole("button", { name: "+ Log a round" })).toHaveLength(1);
    fireEvent.click(within(hero).getByRole("button", { name: "+ Log a round" }));
    expect(shell.openLog).toHaveBeenCalledOnce();
  });

  it("puts the lists that choose the tracked list at the top of the hero, above the progress they change", () => {
    openHome();
    const hero = screen.getByRole("region", { name: "Best in Michigan" });
    const lists = within(hero).getByRole("group", { name: "Your lists" });
    expect(lists.compareDocumentPosition(within(hero).getByRole("heading", { level: 1 }))).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows every national list and the home state's, with the tracked one pressed", () => {
    openHome();
    const lists = screen.getByRole("group", { name: "Your lists" });
    expect(within(lists).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Track World Top 100, 5 of 100 played",
      "Track USA Top 100, 7 of 100 played",
      "Track Best in Michigan, 13 of 100 played",
    ]);
    expect(within(lists).getByRole("button", { name: /Best in Michigan/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(lists).getByRole("button", { name: /USA Top 100/ })).toHaveAttribute("aria-pressed", "false");
    expect(within(lists).getByRole("link", { name: "All lists" })).toHaveAttribute("href", "/u/golfer/lists");
  });

  it("offers the same lists as a dropdown for phones, with the tracked one selected", () => {
    const router = openHome();
    const dropdown = screen.getByRole("combobox", { name: "Track a list" });
    expect(within(dropdown).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "World Top 100 · 5/100",
      "USA Top 100 · 7/100",
      "Best in Michigan · 13/100",
    ]);
    expect(dropdown).toHaveValue("state-mi");
    fireEvent.change(dropdown, { target: { value: "usa" } });
    expect(localStorage.getItem(HOME_GOAL_LIST_KEY)).toBe("usa");
    expect(router.state.location.search).toBe("?goal=usa");
  });

  it("tracks another list: remembers it on this browser and shows it through the URL", () => {
    const router = openHome();
    fireEvent.click(screen.getByRole("button", { name: /^Track USA Top 100/ }));
    expect(localStorage.getItem(HOME_GOAL_LIST_KEY)).toBe("usa");
    expect(router.state.location.search).toBe("?goal=usa");
    expect(shell.notify).not.toHaveBeenCalled();
  });

  it("selects the list being switched to while Home reloads its progress", async () => {
    // Home's reload never finishes, so the page stays mid-switch.
    openHome({}, ({ request }) => (new URL(request.url).searchParams.has("goal") ? new Promise(() => undefined) : null));
    fireEvent.click(await screen.findByRole("button", { name: /^Track USA Top 100/ }));
    expect(await screen.findByRole("button", { name: /^Track USA Top 100/, pressed: true })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Track Best in Michigan/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("combobox", { name: "Track a list" })).toHaveValue("usa");
  });

  it("says so when the choice cannot be remembered, and still shows it", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const router = openHome();
    fireEvent.click(screen.getByRole("button", { name: /^Track USA Top 100/ }));
    expect(shell.notify).toHaveBeenCalledWith("Couldn't remember that list on this browser. Home shows it until you leave.");
    expect(router.state.location.search).toBe("?goal=usa");
  });

  it("offers the next unplayed courses on the tracked list, Want to play first, ready to log", () => {
    openHome();
    const next = screen.getByRole("list", { name: "Up next on Best in Michigan" });
    expect(within(next).getAllByRole("listitem").map((item) => item.getAttribute("data-course"))).toEqual([
      "Kingsley Club",
      "Crystal Downs",
      "Dunes Club",
    ]);
    expect(within(next).getAllByRole("listitem")[0]).toHaveTextContent("On your Want to play");
    expect(screen.getByRole("link", { name: "See the list" })).toHaveAttribute("href", "/courses?list=state-mi");
    fireEvent.click(within(next).getByRole("button", { name: "Log a round at Crystal Downs" }));
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("points a finished list to the others", () => {
    openHome({ goalCourses: michigan.map((course) => ({ ...course, played: 1 })) });
    expect(screen.getByText("Every course played")).toBeVisible();
  });

  it("shows three friends' rounds at different courses, noted from the member's side", () => {
    openHome();
    const friends = screen.getByRole("region", { name: /From your friends/ });
    expect(within(friends).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "MCMaya Castillo played Bandon TrailsSep 25 · First visitYour #2",
      "DWDan Whitaker played Bethpage BlackSep 25 · 10th roundUSA #38",
      "DWDan Whitaker played RackhamSep 25 · 32nd roundMichigan #89",
    ]);
    expect(within(friends).getByRole("link", { name: "All activity" })).toHaveAttribute("href", "/activity");
  });

  it("closes with the member's top four and a way to the full ranking", () => {
    openHome();
    const top = screen.getByRole("region", { name: /Top four/ });
    expect(within(top).getAllByRole("img").map((tile) => tile.getAttribute("aria-label"))).toEqual(["Pacific Dunes, OR", "Bandon Trails, OR"]);
    expect(within(top).getByRole("link", { name: "Your ranking" })).toHaveAttribute("href", "/u/golfer/ranking");
    expect(screen.getByText("2 courses ranked")).toBeVisible();
  });

  it("gives a new member a first step in every section", () => {
    openHome({
      standings: [standing("global", "GLOBAL", "World Top 100", 0), standing("state", "MI", "Best in Michigan", 0)],
      activity: [],
      rows: [],
    });
    const hero = screen.getByRole("region", { name: "Best in Michigan" });
    expect(hero).toHaveTextContent("0of 100 played · 100 to go");
    expect(hero).toHaveTextContent("Log the courses you've played on it and watch this fill in.");
    expect(screen.getByText("Quiet on the course")).toBeVisible();
    expect(screen.getByRole("link", { name: "Find friends" })).toHaveAttribute("href", "/friends");
    expect(screen.getByText("Your top four live here")).toBeVisible();
    expect(screen.queryByText(/courses? ranked/)).not.toBeInTheDocument();
  });

  it("still offers Log a round when there are no published lists", () => {
    openHome({ standings: [], goal: null, goalCourses: [] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Log a round to start your ranking");
    fireEvent.click(screen.getByRole("button", { name: "+ Log a round" }));
    expect(shell.openLog).toHaveBeenCalledOnce();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Your lists" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Track a list" })).not.toBeInTheDocument();
  });
});
