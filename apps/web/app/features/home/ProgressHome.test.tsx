import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSchema, type Course } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { FeedItemType, type FeedItem, type TopListStanding } from "@coursebook/domain/social/types";
import type { Shell } from "../../shared/ui/shell";
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
  standing("state", "MI", "Best in Michigan", 13, [{ member: dan, played: 20 }]),
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

const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

function openHome(props: Partial<Parameters<typeof ProgressHome>[0]> = {}, selectedState = "MI") {
  const shell: Shell = { selectedState, onState: vi.fn(), notify: vi.fn(), searchFocus: vi.fn(), openAuth: vi.fn() };
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={shell} />,
        children: [
          {
            path: "/",
            element: <ProgressHome standings={standings} activity={activity} rows={rows} username="golfer" {...props} />,
          },
        ],
      },
    ],
    { initialEntries: ["/"] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
}

describe("progress home", () => {
  it("leads with progress on the home-state list and one way to log a round", () => {
    openHome();
    const hero = screen.getByRole("region", { name: "Best in Michigan" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Best in Michigan");
    expect(hero).toHaveTextContent("Your home state");
    expect(hero).toHaveTextContent("13of 100 played · 87 to go");
    expect(within(hero).getByRole("progressbar", { name: "Best in Michigan played" })).toHaveAttribute("aria-valuenow", "13");
    expect(hero).toHaveTextContent("Dan Whitaker has played 20.");
    expect(within(hero).getByRole("link", { name: "+ Log a round" })).toHaveAttribute("href", "/u/golfer/ranking?log=1");
    expect(within(hero).getByRole("link", { name: "See the list" })).toHaveAttribute("href", "/courses?list=state-mi");
    expect(screen.getAllByRole("link", { name: "+ Log a round" })).toHaveLength(1);
  });

  it("follows the chosen state, and the closest list without one", () => {
    openHome({}, "");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Best in Michigan");
    expect(screen.getByRole("region", { name: "Best in Michigan" })).toHaveTextContent("Your closest list");
  });

  it("shows three friends' rounds at different courses, noted from the member's side", () => {
    openHome();
    const friends = screen.getByRole("region", { name: /From your friends/ });
    const items = within(friends).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "MCMaya Castillo played Bandon TrailsSep 25 · First visitYour #2",
      "DWDan Whitaker played Bethpage BlackSep 25 · 10th roundUSA #38",
      "DWDan Whitaker played RackhamSep 25 · 32nd roundMichigan #89",
    ]);
    expect(within(friends).getByRole("link", { name: "All activity" })).toHaveAttribute("href", "/activity");
  });

  it("closes with the member's top four and a way to the full ranking", () => {
    openHome();
    const top = screen.getByRole("region", { name: /Top four/ });
    expect(within(top).getAllByRole("img").map((tile) => tile.getAttribute("aria-label"))).toEqual([
      "Pacific Dunes, OR",
      "Bandon Trails, OR",
    ]);
    expect(within(top).getByRole("link", { name: "Your ranking" })).toHaveAttribute("href", "/u/golfer/ranking");
    expect(screen.getByText("2 courses ranked")).toBeVisible();
  });

  it("gives a new member a first step in every section", () => {
    openHome({ standings: [standing("global", "GLOBAL", "World Top 100", 0), standing("state", "MI", "Best in Michigan", 0)], activity: [], rows: [] });
    const hero = screen.getByRole("region", { name: "Best in Michigan" });
    expect(hero).toHaveTextContent("0of 100 played · 100 to go");
    expect(hero).toHaveTextContent("Log the courses you've played on it and watch this fill in.");
    expect(screen.getByText("Quiet on the course")).toBeVisible();
    expect(screen.getByRole("link", { name: "Find friends" })).toHaveAttribute("href", "/friends");
    expect(screen.getByText("Your top four live here")).toBeVisible();
    expect(screen.queryByText(/courses? ranked/)).not.toBeInTheDocument();
  });

  it("still offers Log a round when there are no published lists", () => {
    openHome({ standings: [] });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Log a round to start your ranking");
    expect(screen.getByRole("link", { name: "+ Log a round" })).toHaveAttribute("href", "/u/golfer/ranking?log=1");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
