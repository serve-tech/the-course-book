import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema, type Course } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import type { RankingImageContent } from "../share/ranking-image";
import { MyRanking } from "./MyRanking";

const course = (id: string, name: string, location: string, state = ""): Course =>
  courseSchema.parse({ id, name, location, state, country: location.endsWith("USA") ? "USA" : "Scotland" });

const rows: ListEntry[] = [
  { course: course("pine", "Pine Valley", "Clementon, NJ, USA", "NJ"), rank: 1, played: 1 },
  { course: course("old", "The Old Course", "St Andrews, Scotland"), rank: 2, played: 2 },
  { course: course("crystal", "Crystal Downs", "Frankfort, MI, USA", "MI"), rank: 3, played: 1 },
  { course: course("arcadia", "Arcadia Bluffs", "Arcadia, MI, USA", "MI"), rank: 4, played: 1 },
];

const notify = vi.fn<(message: string) => void>();
const renderImage = vi.fn<(content: RankingImageContent) => Promise<Blob>>();

function show(selectedState = "MI") {
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <MyRanking
            rows={rows}
            username="josh"
            name="Josh Linneburg"
            onLog={() => undefined}
            selectedState={selectedState}
            onState={() => undefined}
            notify={notify}
            onSearchFocus={() => undefined}
            renderImage={renderImage}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );
  return render(<RouterProvider router={router} />);
}

/** The list as "number name", top to bottom. */
/** Courses drawn as the featured photo cards. */
const featured = () => [...document.querySelectorAll("#ranking > li[data-featured]")].map((item) => item.getAttribute("data-course"));

const listed = () =>
  within(screen.getByRole("list", { name: "Ranking" }))
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("data-course"))
    .map((item) => {
      const rank = [...item.querySelectorAll("span")].find((span) => /^\d+$/.test(span.textContent));
      return String(rank?.textContent) + " " + String(item.getAttribute("data-course"));
    });

beforeEach(() => {
  renderImage.mockReset();
  renderImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  notify.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("MyRanking sharing", () => {
  it("offers Copy link and Save image on the ranking itself, with no separate Share link", async () => {
    show();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });
    expect(screen.queryByRole("link", { name: "Share" })).not.toBeInTheDocument();
  });

  it("numbers a tab's courses within the tab, so the screen matches the image", async () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "Best in Michigan" }));
    expect(listed()).toEqual(["1 Crystal Downs", "2 Arcadia Bluffs"]);
    expect(screen.getByRole("heading", { level: 2, name: "Best in Michigan" })).toBeInTheDocument();
    await waitFor(() => {
      expect(renderImage.mock.lastCall?.[0]).toEqual({
        memberName: "Josh Linneburg",
        title: "Best in Michigan",
        link: window.location.host + "/r/josh?view=state-mi",
        rows: [
          { rank: 1, name: "Crystal Downs", place: "Frankfort, MI, USA" },
          { rank: 2, name: "Arcadia Bluffs", place: "Arcadia, MI, USA" },
        ],
      });
    });
  });

  it("cuts the view at the Top N and draws only those courses", async () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "USA" }));
    fireEvent.click(screen.getByRole("button", { name: "Top 5" }));
    expect(screen.getByRole("heading", { level: 2, name: "Top 5 in the USA" })).toBeInTheDocument();
    expect(listed()).toEqual(["1 Pine Valley", "2 Crystal Downs", "3 Arcadia Bluffs"]);
    await waitFor(() => {
      expect(renderImage.mock.lastCall?.[0].link).toBe(window.location.host + "/r/josh?view=usa&top=5");
    });
  });

  it("keeps a course's overall number while searching All", () => {
    show();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "crystal" } });
    expect(listed()).toEqual(["3 Crystal Downs"]);
  });

  it("does not draw again while someone types in the search", async () => {
    show();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });
    const draws = renderImage.mock.calls.length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "pine" } });
    expect(renderImage.mock.calls.length).toBe(draws);
  });

  it("stays editable on All cut to a Top N, and read-only on a region tab", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    fireEvent.click(screen.getByRole("button", { name: "Top 5" }));
    expect(screen.getByText(/Drag a course to change your ranking/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "USA" }));
    expect(screen.getByText(/Switch to All to reorder/)).toBeInTheDocument();
  });

  it("opens on the top three as photo cards, then rows, each linking to the course's page", () => {
    show();
    const links = within(screen.getByRole("list", { name: "Ranking" })).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/courses/pine", "/courses/old", "/courses/crystal", "/courses/arcadia"]);
    expect(featured()).toEqual(["Pine Valley", "The Old Course", "Crystal Downs"]);
    expect(screen.queryByText(/Drag a course/)).not.toBeInTheDocument();
  });

  it("features nothing while searching, because the first results aren't the top three", () => {
    show();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "crystal" } });
    expect(listed()).toEqual(["3 Crystal Downs"]);
    expect(featured()).toEqual([]);
  });

  it("switches to draggable rows with Reorder and back with Done", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Reorder" }));
    expect(within(screen.getByRole("list", { name: "Ranking" })).queryAllByRole("link")).toEqual([]);
    expect(listed()).toEqual(["1 Pine Valley", "2 The Old Course", "3 Crystal Downs", "4 Arcadia Bluffs"]);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(within(screen.getByRole("list", { name: "Ranking" })).getAllByRole("link")).toHaveLength(4);
  });

  it("offers Reorder only where the order can change", () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "USA" }));
    expect(screen.queryByRole("button", { name: "Reorder" })).not.toBeInTheDocument();
  });

  it("offers nothing to share until a state is picked", () => {
    show("");
    fireEvent.click(screen.getByRole("tab", { name: "Best in State" }));
    expect(screen.queryByRole("button", { name: "Copy link" })).not.toBeInTheDocument();
    expect(screen.getByText("Pick a state to see the courses you've played there.")).toBeInTheDocument();
  });
});
