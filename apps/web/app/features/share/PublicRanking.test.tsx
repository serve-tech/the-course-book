import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { courseSchema, RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import type { PublicRanking as Ranking } from "@coursebook/domain/friends/types";
import { PublicRanking } from "./PublicRanking";
import type { RankingImageContent } from "./ranking-image";
import { WHOLE_RANKING, type ShareView } from "@coursebook/domain/sharing/view";

const course = (id: string, name: string, location: string, state = ""): Course =>
  courseSchema.parse({ id, name, location, state, country: location.endsWith("USA") ? "USA" : "Scotland" });

const ranking: Ranking = {
  member: { username: "josh", displayName: "Josh Linneburg" },
  rows: [
    { course: course("pine", "Pine Valley", "Clementon, NJ, USA", "NJ"), rank: 1 },
    { course: course("old", "The Old Course", "St Andrews, Scotland"), rank: 2 },
    { course: course("crystal", "Crystal Downs", "Frankfort, MI, USA", "MI"), rank: 3 },
    { course: course("arcadia", "Arcadia Bluffs", "Arcadia, MI, USA", "MI"), rank: 4 },
  ],
};

const long: Ranking = {
  member: ranking.member,
  rows: Array.from({ length: 12 }, (_, index) => ({
    course: course("c" + String(index + 1), "Course " + String(index + 1), "Detroit, MI, USA", "MI"),
    rank: index + 1,
  })),
};

const notify = vi.fn<(message: string) => void>();
const onJoin = vi.fn<() => void>();
const renderImage = vi.fn<(content: RankingImageContent) => Promise<Blob>>();

/** The page with the view in state, as the route keeps it in the link. */
function Page({ initial, signedOut, subject }: { initial: ShareView; signedOut: boolean; subject: Ranking }) {
  const [view, setView] = useState(initial);
  return (
    <MemoryRouter>
      <PublicRanking
        ranking={subject}
        view={view}
        onView={setView}
        signedOut={signedOut}
        onJoin={onJoin}
        notify={notify}
        onSearchFocus={() => undefined}
        renderImage={renderImage}
      />
    </MemoryRouter>
  );
}

const show = ({ initial = WHOLE_RANKING, signedOut = true, subject = ranking }: { initial?: ShareView; signedOut?: boolean; subject?: Ranking } = {}) =>
  render(<Page initial={initial} signedOut={signedOut} subject={subject} />);

/** The list as "number name", top to bottom. */
const listed = () =>
  within(screen.getByRole("list", { name: "Josh Linneburg's ranking" }))
    .getAllByRole("listitem")
    .filter((item) => item.getAttribute("data-course"))
    .map((item) => String(item.querySelector("span")?.textContent) + " " + String(item.getAttribute("data-course")));

beforeEach(() => {
  renderImage.mockReset();
  renderImage.mockResolvedValue(new Blob(["png"], { type: "image/png" }));
  notify.mockReset();
  onJoin.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "clipboard");
});

/** jsdom has no clipboard, so the browser's is stood in for. */
function stubClipboard(implementation: (text: string) => Promise<void>) {
  const writeText = vi.fn(implementation);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  return writeText;
}

describe("PublicRanking", () => {
  it("shows the member, their stats from courses alone and the whole ranking", () => {
    show();
    expect(screen.getByRole("heading", { level: 1, name: "Josh Linneburg" })).toBeInTheDocument();
    const stats = screen.getByLabelText("Stats");
    expect(within(stats).getByText("Courses").previousSibling).toHaveTextContent("4");
    expect(within(stats).getByText("States").previousSibling).toHaveTextContent("2");
    expect(within(stats).getByText("Countries").previousSibling).toHaveTextContent("2");
    expect(within(stats).queryByText("Rounds")).not.toBeInTheDocument();
    expect(screen.getByText(/Most courses in Michigan/)).toBeInTheDocument();
    expect(listed()).toEqual(["1 Pine Valley", "2 The Old Course", "3 Crystal Downs", "4 Arcadia Bluffs"]);
  });

  it("numbers a state's courses within the state and cuts at the Top N", () => {
    show({ initial: { region: RegionFilter.State, state: "MI", top: 1 } });
    expect(screen.getByRole("heading", { level: 2, name: "Top 1 in Michigan" })).toBeInTheDocument();
    expect(listed()).toEqual(["1 Crystal Downs"]);
  });

  it("opens a state view with no state on the state the member played most", () => {
    show({ initial: { region: RegionFilter.State, state: "", top: null } });
    expect(screen.getByRole("heading", { level: 2, name: "Best in Michigan" })).toBeInTheDocument();
    expect(listed()).toEqual(["1 Crystal Downs", "2 Arcadia Bluffs"]);
  });

  it("names the state tab after the member's most-played state before it is chosen", () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "Best in Michigan" }));
    expect(listed()).toEqual(["1 Crystal Downs", "2 Arcadia Bluffs"]);
  });

  it("changes the region and Top N from the controls", () => {
    show();
    fireEvent.click(screen.getByRole("tab", { name: "International" }));
    expect(screen.getByRole("heading", { level: 2, name: "Best outside the USA" })).toBeInTheDocument();
    expect(listed()).toEqual(["1 The Old Course"]);
    fireEvent.click(screen.getByRole("tab", { name: "USA" }));
    fireEvent.click(screen.getByRole("button", { name: "Top 5" }));
    expect(screen.getByRole("button", { name: "Top 5" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { level: 2, name: "Top 5 in the USA" })).toBeInTheDocument();
    expect(listed()).toEqual(["1 Pine Valley", "2 Crystal Downs", "3 Arcadia Bluffs"]);
  });

  it("searches a long view and keeps each course's number", () => {
    show({ subject: long });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "course 7" } });
    expect(listed()).toEqual(["7 Course 7"]);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "zzz" } });
    expect(screen.getByText("No courses here match.")).toBeInTheDocument();
  });

  it("offers no search on a short view, and a search typed on a long one does not hide its rows", () => {
    show({ subject: long });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: "Top 5" }));
    expect(screen.queryByRole("searchbox", { name: "Search this ranking" })).not.toBeInTheDocument();
    expect(listed()).toHaveLength(5);
  });

  it("says so when the member has ranked nothing, and offers no image", () => {
    show({ subject: { member: ranking.member, rows: [] } });
    expect(screen.getByText("Josh Linneburg hasn't ranked any courses yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save image" })).toBeDisabled();
    expect(renderImage).not.toHaveBeenCalled();
  });

  it("invites signed-out visitors only", () => {
    const { unmount } = show({ signedOut: true });
    fireEvent.click(screen.getByRole("button", { name: "Make your ranking" }));
    expect(onJoin).toHaveBeenCalledOnce();
    unmount();
    show({ signedOut: false });
    expect(screen.queryByRole("button", { name: "Make your ranking" })).not.toBeInTheDocument();
  });
});

describe("sharing", () => {
  it("draws the current view with its numbers and link, and redraws when the view changes", async () => {
    show({ initial: { region: RegionFilter.State, state: "MI", top: 5 } });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });
    expect(renderImage.mock.lastCall?.[0]).toEqual({
      memberName: "Josh Linneburg",
      title: "Top 5 in Michigan",
      link: window.location.host + "/r/josh?view=state-mi&top=5",
      rows: [
        { rank: 1, name: "Crystal Downs", place: "Frankfort, MI, USA" },
        { rank: 2, name: "Arcadia Bluffs", place: "Arcadia, MI, USA" },
      ],
    });
    fireEvent.click(screen.getByRole("tab", { name: "All" }));
    await waitFor(() => {
      expect(renderImage.mock.lastCall?.[0].title).toBe("Top 5");
    });
  });

  it("does not draw again while someone types in the search", async () => {
    show({ subject: long });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });
    const draws = renderImage.mock.calls.length;
    fireEvent.change(screen.getByRole("searchbox", { name: "Search this ranking" }), { target: { value: "pine" } });
    expect(renderImage.mock.calls.length).toBe(draws);
  });

  it("shows why when the image could not be drawn", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    renderImage.mockRejectedValue(new Error("This ranking is too long for this browser to draw."));
    show();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save image" })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole("button", { name: "Save image" }));
    expect(notify).toHaveBeenCalledWith("This ranking is too long for this browser to draw.");
  });

  it("copies the link to the current view", async () => {
    const writeText = stubClipboard(() => Promise.resolve());
    show({ initial: { ...WHOLE_RANKING, top: 10 } });
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Link copied");
    });
    expect(writeText).toHaveBeenCalledWith(window.location.origin + "/r/josh?top=10");
  });

  it("shows the link when the clipboard refuses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    stubClipboard(() => Promise.reject(new Error("denied")));
    show();
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => {
      expect(notify).toHaveBeenCalledWith("Couldn't copy it. The link is " + window.location.origin + "/r/josh");
    });
  });
});
