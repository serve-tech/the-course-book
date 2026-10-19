import "@testing-library/jest-dom/vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import type { Shell } from "../../shared/ui/shell";
import { RankingHome } from "./RankingHome";

const rows: ListEntry[] = [
  {
    course: courseSchema.parse({
      id: "beta",
      name: "Beta Links",
      location: "Fife, Scotland",
      country: "Scotland",
    }),
    rank: 1,
    played: 2,
  },
  {
    course: courseSchema.parse({
      id: "alpha",
      name: "Alpha Club",
      location: "Detroit, MI, USA",
      country: "USA",
      state: "MI",
    }),
    rank: 2,
    played: 1,
  },
];
const shell: Shell = {
  selectedState: "MI",
  onState: vi.fn(),
  notify: vi.fn(),
  searchFocus: vi.fn(),
  openAuth: vi.fn(),
};
const routers: ReturnType<typeof createMemoryRouter>[] = [];

function openHome(entries = rows, path = "/") {
  const router = createMemoryRouter(
    [
      {
        element: <Outlet context={shell} />,
        children: [
          {
            path: "/",
            element: <RankingHome rows={entries} username="golfer" />,
          },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  // Search and rounds are external API boundaries; opening a dialog alone makes no request.
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

describe("ranking home", () => {
  it("shows the full ranking immediately, preserves personal order and lets the member search it", () => {
    openHome();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Your courses, ranked.",
    );
    const ranking = screen.getByRole("list", { name: "Ranking" });
    expect(
      within(ranking)
        .getAllByRole("listitem")
        .map((row) => row.getAttribute("data-course")),
    ).toEqual(["Beta Links", "Alpha Club"]);
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search this ranking" }),
      { target: { value: "Alpha" } },
    );
    expect(within(ranking).getAllByRole("listitem")).toHaveLength(1);
    expect(ranking).toHaveTextContent("Alpha Club");
  });

  it("offers direct links to personal lists, published lists and activity", () => {
    openHome();
    expect(screen.getByRole("link", { name: /My lists/ })).toHaveAttribute(
      "href",
      "/u/golfer/lists",
    );
    expect(screen.getByRole("link", { name: /World Top 100/ })).toHaveAttribute(
      "href",
      "/courses?list=world",
    );
    expect(
      screen.getByRole("link", { name: /USA Public Top 100/ }),
    ).toHaveAttribute("href", "/courses?list=usa-public");
    expect(screen.getByRole("link", { name: /Best in State/ })).toHaveAttribute(
      "href",
      "/courses?list=state",
    );
    expect(
      screen.getByRole("link", { name: /See where friends/ }),
    ).toHaveAttribute("href", "/activity");
  });

  it("gives an empty ranking an actionable first step", () => {
    openHome([]);
    expect(screen.getByText(/Your ranking is empty/)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Log your first round" }),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("consumes Log deep links, preserves other parameters and can open the dialog again", async () => {
    const router = openHome(rows, "/?log=1&keep=yes");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(router.state.location.search).toBe("?keep=yes");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(() => router.navigate("/?log=1&keep=yes"));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(router.state.location.search).toBe("?keep=yes");
  });
});
