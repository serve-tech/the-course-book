import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import type { CoursePage } from "@coursebook/domain/social/types";
import { CoursePageView } from "./CoursePageView";

const priya = { username: "priya", displayName: "Priya" };
const ben = { username: "ben", displayName: "Ben" };
const photo = {
  url: "https://upload.wikimedia.org/arcadia.jpg",
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

function show(page: CoursePage) {
  const router = createMemoryRouter(
    [{ path: "/courses/:id", element: <CoursePageView page={page} notify={() => undefined} openAuth={() => undefined} /> }],
    { initialEntries: ["/courses/arcadia"] },
  );
  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

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
});
