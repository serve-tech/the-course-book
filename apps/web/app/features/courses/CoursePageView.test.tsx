import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { CoursePage } from "@coursebook/domain/social/types";
import { CoursePageView } from "./CoursePageView";

const priya = { username: "priya", displayName: "Priya" };
const ben = { username: "ben", displayName: "Ben" };
const photo = {
  url: "https://upload.wikimedia.org/arcadia.jpg",
  thumbUrl: "https://upload.wikimedia.org/arcadia-330.jpg",
  credit: "Benscripps",
  license: "CC BY-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs1011.jpg",
};
const course = (withPhoto: boolean) =>
  courseSchema.parse({
    id: "arcadia",
    name: "Arcadia Bluffs",
    location: "Arcadia, MI, USA",
    state: "MI",
    country: "USA",
    public: 16,
    stateRank: 5,
    photo: withPhoto ? photo : null,
  });

/** Form fields posted to the curator screen's action, by the photo's Remove. */
let posted: Record<string, FormDataEntryValue>[] = [];

function show(page: CoursePage, canCurate = false) {
  const router = createMemoryRouter(
    [
      { path: "/courses/:id", element: <CoursePageView page={page} canCurate={canCurate} notify={() => undefined} openAuth={() => undefined} /> },
      {
        path: "/curate",
        action: async ({ request }) => {
          posted.push(Object.fromEntries(await request.formData()));
          return { ok: true, message: "Photo removed from Arcadia Bluffs" };
        },
      },
    ],
    { initialEntries: ["/courses/arcadia"] },
  );
  return render(<RouterProvider router={router} />);
}

const standing = { you: { rank: 5, outOf: 23, wantToPlay: false }, friendsRanked: [], friendsWantToPlay: [] };

afterEach(() => {
  cleanup();
  posted = [];
  vi.restoreAllMocks();
});

describe("CoursePageView", () => {
  it("shows a ranked course with its photo, published ranks, friends and the photo's credit", () => {
    show({
      course: course(true),
      you: { rank: 5, outOf: 23, wantToPlay: false },
      friendsRanked: [{ member: ben, rank: 1, outOf: 21 }],
      friendsWantToPlay: [priya],
    });
    expect(screen.getByRole("heading", { level: 1, name: "Arcadia Bluffs" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Photo of Arcadia Bluffs" })).toHaveAttribute("src", photo.url);
    expect(screen.getByText("Your ranking")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/");
    const ranks = within(screen.getByRole("region", { name: "Published rankings" })).getAllByRole("listitem");
    expect(ranks.map((item) => item.textContent)).toEqual(["#16USA Public Top 100", "#5Best in Michigan"]);
    expect(within(screen.getByRole("list", { name: "Friends who rank it" })).getByRole("link")).toHaveAttribute("href", "/u/ben/ranking");
    expect(screen.getByText("Want to play it: Priya")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CC BY-SA 3.0" })).toHaveAttribute("href", photo.licenseUrl);
  });

  it("offers Played it and Want to play for a course not on the ranking", () => {
    show({ course: course(false), you: { rank: null, outOf: 23, wantToPlay: true }, friendsRanked: [], friendsWantToPlay: [] });
    expect(screen.getByText("Not on your ranking")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Played it" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Saved" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText(/None of your friends has ranked it/)).toBeInTheDocument();
  });

  it("turns a missing photo into one large Add a photo button for curators", () => {
    show({ course: course(false), ...standing }, true);
    expect(screen.getByRole("link", { name: /^Add a photo/ })).toHaveAttribute("href", "/curate?course=arcadia&back=course");
    expect(screen.queryByRole("link", { name: "Change photo" })).not.toBeInTheDocument();
  });

  it("puts Change photo and Remove on a curator's photo, and removes only once confirmed", async () => {
    show({ course: course(true), ...standing }, true);
    expect(screen.getByRole("link", { name: "Change photo" })).toHaveAttribute("href", "/curate?course=arcadia&back=course");

    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(confirm).toHaveBeenCalledWith("Remove the photo from Arcadia Bluffs?");
    expect(posted).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => {
      expect(posted).toEqual([{ intent: "remove-photo", courseId: "arcadia" }]);
    });
  });

  it.each([
    { name: "without a photo", withPhoto: false },
    { name: "with a photo", withPhoto: true },
  ])("offers members who don't curate no photo buttons, $name", ({ withPhoto }) => {
    show({ course: course(withPhoto), ...standing });
    expect(screen.queryByRole("link", { name: /Add a photo|Change photo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
  });
});
