import "@testing-library/jest-dom/vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutMode } from "./layout-preview";
import { TabBar, TopBar, type NavMember } from "./AppNav";

vi.mock("@clerk/react-router", () => ({ useUser: () => ({ user: null }) }));
const member: NavMember = { username: "golfer", displayName: "A Golfer" };
const routers: ReturnType<typeof createMemoryRouter>[] = [];
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

describe.each([
  { name: "desktop", Bar: TopBar },
  { name: "mobile", Bar: TabBar },
])("$name navigation", ({ Bar }) => {
  function openNav(
    user: NavMember | null = member,
    path = "/",
    layout = LayoutMode.CourseFirst,
  ) {
    const onSignIn = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <Bar
              layout={layout}
              member={user}
              incomingRequests={2}
              onSignIn={onSignIn}
              onSignOut={vi.fn()}
              onNavigate={vi.fn()}
            />
          ),
        },
      ],
      { initialEntries: [path] },
    );
    routers.push(router);
    render(<RouterProvider router={router} />);
    return {
      nav: within(screen.getByRole("navigation", { name: "Main" })),
      onSignIn,
    };
  }

  it("preserves Classic Home and Profile navigation", () => {
    const { nav } = openNav(member, "/", LayoutMode.Classic);
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute(
      "href",
      "/u/golfer",
    );
    expect(
      nav.queryByRole("link", { name: "My lists" }),
    ).not.toBeInTheDocument();
    if (Bar === TabBar)
      expect(nav.getByRole("link", { name: "Log a round" })).toHaveAttribute(
        "href",
        "/u/golfer/ranking?log=1",
      );
  });

  it("puts the ranking and lists first, with direct access to activity and friends", () => {
    const { nav } = openNav();
    expect(
      nav.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/", "/u/golfer/lists", "/courses", "/activity", "/friends"]);
    expect(nav.getByRole("link", { name: "My ranking" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "My lists" })).toHaveAttribute(
      "href",
      "/u/golfer/lists",
    );
    expect(nav.getByLabelText("2 friend requests")).toBeInTheDocument();
  });

  it("keeps My lists active while looking at an individual checklist", () => {
    const { nav } = openNav(member, "/u/golfer/lists/world");
    expect(nav.getByRole("link", { name: "My lists" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "My ranking" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("offers visitors sign-in for their lists and keeps public courses available", () => {
    const { nav, onSignIn } = openNav(null);
    fireEvent.click(nav.getByRole("button", { name: "My lists" }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(nav.getByRole("link", { name: "Courses" })).toHaveAttribute(
      "href",
      "/courses",
    );
  });
});
