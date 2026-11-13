import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, Outlet, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import type { Shell } from "../../shared/ui/shell";
import { HomeRanking } from "./HomeRanking";
import { openingTop } from "./opening-top";

const ranking = (length: number): ListEntry[] =>
  Array.from({ length }, (_, index) => ({
    course: courseSchema.parse({
      id: "c" + String(index + 1),
      name: "Course " + String(index + 1),
      location: "Detroit, MI, USA",
      state: "MI",
      country: "USA",
    }),
    rank: index + 1,
    played: 1,
  }));

const shell: Shell = {
  notify: () => undefined,
  selectedState: "MI",
  onState: () => undefined,
  searchFocus: () => undefined,
  openAuth: () => undefined,
  openLog: () => undefined,
  canCurate: false,
};

const onLog = vi.fn<() => void>();

function show(rows: ListEntry[]) {
  const router = createMemoryRouter([
    {
      element: <Outlet context={shell} />,
      children: [{ path: "/", element: <HomeRanking rows={rows} member={{ username: "josh", displayName: "Josh Linneburg" }} onLog={onLog} /> }],
    },
  ]);
  return render(<RouterProvider router={router} />);
}

const listedCount = () =>
  within(screen.getByRole("list", { name: "Ranking" }))
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("data-course")).length;

afterEach(() => {
  cleanup();
  onLog.mockReset();
});

describe("openingTop", () => {
  it.each([
    [0, null],
    [3, null],
    [10, null],
    [11, 10],
    [200, 10],
  ])("for %i courses opens on %s", (courses, top) => {
    expect(openingTop(courses)).toBe(top);
  });
});

describe("HomeRanking", () => {
  it("opens a long ranking on the Top 10, with its share buttons and no search", () => {
    show(ranking(12));
    expect(screen.getByRole("heading", { level: 1, name: "Your ranking" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Top 10" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Top 10" })).toHaveAttribute("aria-pressed", "true");
    expect(listedCount()).toBe(10);
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save image" })).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("opens a short ranking on every course", () => {
    show(ranking(3));
    expect(screen.getByRole("heading", { level: 2, name: "Ranking" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "How many courses" })).toBeInTheDocument();
    expect(listedCount()).toBe(3);
  });

  it("offers the search once the view is long", () => {
    show(ranking(12));
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(listedCount()).toBe(12);
    expect(screen.getByRole("searchbox", { name: "Search this ranking" })).toBeInTheDocument();
  });

  it("leaves out round counts, and draws its header like the other pages", () => {
    show(ranking(3));
    expect(screen.queryByText(/\d round/)).not.toBeInTheDocument();
    expect(screen.getByText("Your course book")).toBeInTheDocument();
    expect(screen.getByText("Every course you've played, best first.")).toBeInTheDocument();
  });

  it("logs a round over Home", () => {
    show(ranking(3));
    fireEvent.click(screen.getByRole("button", { name: "+ Log a round" }));
    expect(onLog).toHaveBeenCalledOnce();
  });

  it("opens an empty ranking on real next steps, with nothing to share", () => {
    show([]);
    expect(screen.getByText(/Your ranking is empty/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
  });
});
