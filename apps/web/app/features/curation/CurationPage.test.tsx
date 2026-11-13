import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import { courseSchema } from "@coursebook/domain/catalog/course";
import { MemberRole } from "@coursebook/domain/curation/types";
import { CurationTab } from "./curation";
import { CurationPage, type CurationView } from "./CurationPage";

const photo = {
  url: "https://upload.wikimedia.org/a.jpg",
  credit: "Benscripps",
  license: "CC BY-SA 3.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs1011.jpg",
};
const course = (id: string, name: string, withPhoto = false) => courseSchema.parse({ id, name, location: "Somewhere, MI, USA", photo: withPhoto ? photo : null });
const candidate = (file: string, sourceUrl: string) => ({
  file,
  thumbUrl: "https://upload.wikimedia.org/thumb.jpg",
  width: 1936,
  height: 1390,
  credit: "Benscripps",
  license: "CC BY-SA 3.0",
  licenseUrl: null,
  sourceUrl,
  description: "Over the 10th and 11th",
});

function show(view: CurationView) {
  const router = createMemoryRouter([{ path: "/curate", element: <CurationPage view={view} notify={() => undefined} />, action: () => ({ ok: true }) }], {
    initialEntries: ["/curate"],
  });
  return render(<RouterProvider router={router} />);
}

afterEach(cleanup);

describe("CurationPage", () => {
  const courses = [
    { course: course("a", "Arcadia Bluffs", true), note: "3 members" },
    { course: course("b", "Pacific Dunes"), note: "2 members" },
  ];
  const world = { type: "global", scope: "GLOBAL" };

  it("opens on the courses still missing a photo, with progress", () => {
    show({ role: MemberRole.Curator, tab: CurationTab.Photos, source: null, courses, picking: null });
    expect(screen.getByText("of 2 courses")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Courses from" })).toHaveValue("members");
    expect(screen.getByText("2 members")).toBeInTheDocument();
    const list = () => within(screen.getByRole("list", { name: "Courses" })).getAllByRole("link");
    expect(list().map((link) => link.getAttribute("href"))).toEqual(["/curate?course=b"]);
    fireEvent.click(screen.getByRole("button", { name: "All (2)" }));
    expect(list()).toHaveLength(2);
    expect(screen.queryByRole("navigation", { name: "Curation" })).not.toBeInTheDocument();
  });

  it("offers Commons photos for one course and marks its current one", () => {
    show({
      role: MemberRole.Admin,
      tab: CurationTab.Photos,
      source: null,
      courses,
      picking: {
        course: course("a", "Arcadia Bluffs", true),
        query: "Arcadia Bluffs",
        candidates: [candidate("File:ArcadiaBluffs1011.jpg", photo.sourceUrl), candidate("File:ArcadiaBluffs18th.jpg", "https://commons.wikimedia.org/wiki/File:ArcadiaBluffs18th.jpg")],
        searchError: null,
      },
    });
    expect(screen.getByRole("heading", { level: 2, name: "Arcadia Bluffs" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search Wikimedia Commons" })).toHaveValue("Arcadia Bluffs");
    expect(screen.getByRole("button", { name: "Current photo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Use this photo" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remove photo" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Curation" })).toBeInTheDocument();
  });

  it("works through a published list and keeps it on the way to a course and back", () => {
    const pine = course("p", "Pine Valley Golf Club");
    const listed = [
      { course: pine, note: "#1" },
      { course: course("c", "Cypress Point Club", true), note: "#2" },
    ];
    show({ role: MemberRole.Curator, tab: CurationTab.Photos, source: world, courses: listed, picking: null });
    expect(screen.getByRole("combobox", { name: "Courses from" })).toHaveValue("world");
    expect(screen.getByText("World Top 100", { selector: "p" })).toBeInTheDocument();
    const link = within(screen.getByRole("list", { name: "Courses" })).getByRole("link");
    expect(link).toHaveAttribute("href", "/curate?course=p&from=world");
    expect(link).toHaveTextContent("#1");

    cleanup();
    show({
      role: MemberRole.Curator,
      tab: CurationTab.Photos,
      source: world,
      courses: listed,
      picking: { course: pine, query: "Pine Valley Golf Club", candidates: [], searchError: null },
    });
    expect(screen.getByRole("link", { name: "← World Top 100" })).toHaveAttribute("href", "/curate?from=world");
  });

  it("keeps the course on screen when Commons is down", () => {
    show({
      role: MemberRole.Curator,
      tab: CurationTab.Photos,
      source: null,
      courses,
      picking: { course: course("b", "Pacific Dunes"), query: "Pacific Dunes", candidates: [], searchError: "Wikimedia Commons isn't answering right now." },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Wikimedia Commons isn't answering right now.");
    expect(screen.queryByRole("button", { name: "Remove photo" })).not.toBeInTheDocument();
  });

  it("lets an admin make members curators, and leaves admins alone", () => {
    show({
      role: MemberRole.Admin,
      tab: CurationTab.Curators,
      members: [
        { member: { username: "josh", displayName: "Josh" }, role: MemberRole.Admin },
        { member: { username: "cora", displayName: "Cora" }, role: MemberRole.Curator },
        { member: { username: "max", displayName: "Max" }, role: MemberRole.Member },
      ],
    });
    const rows = within(screen.getByRole("list", { name: "Members" })).getAllByRole("listitem");
    expect(rows.map((row) => within(row).queryByRole("button")?.textContent ?? row.textContent)).toEqual([
      expect.stringContaining("Admin"),
      "Remove curator",
      "Make curator",
    ]);
  });
});
