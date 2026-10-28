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
    const onLog = vi.fn();
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
              onLog={onLog}
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
      onLog,
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
      expect(nav.getByRole("button", { name: "Log a round" })).toBeInTheDocument();
  });

  it("leads with Home, then the member's ranking, with friends one tap away", () => {
    const { nav } = openNav();
    expect(
      nav.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(
      Bar === TabBar
        ? ["/", "/u/golfer/ranking", "/courses", "/friends"]
        : ["/", "/u/golfer/ranking", "/u/golfer/lists", "/courses", "/activity", "/friends"],
    );
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByLabelText("2 friend requests")).toBeInTheDocument();
  });

  it("marks My ranking, not Home, on the member's ranking", () => {
    const { nav } = openNav(member, "/u/golfer/ranking");
    expect(nav.getByRole("link", { name: "My ranking" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it.runIf(Bar === TopBar)(
    "keeps My lists active while looking at an individual checklist",
    () => {
      const { nav } = openNav(member, "/u/golfer/lists/world");
      expect(nav.getByRole("link", { name: "My lists" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(nav.getByRole("link", { name: "My ranking" })).not.toHaveAttribute(
        "aria-current",
      );
    },
  );

  it.runIf(Bar === TabBar).each([LayoutMode.Classic, LayoutMode.CourseFirst])(
    "opens Log a round over the current page in %s, and sign-in for visitors",
    (layout) => {
      const signedIn = openNav(member, "/courses", layout);
      fireEvent.click(signedIn.nav.getByRole("button", { name: "Log a round" }));
      expect(signedIn.onLog).toHaveBeenCalledOnce();
      expect(signedIn.onSignIn).not.toHaveBeenCalled();
      cleanup();
      const visitor = openNav(null, "/courses", layout);
      fireEvent.click(visitor.nav.getByRole("button", { name: "Log a round" }));
      expect(visitor.onSignIn).toHaveBeenCalledOnce();
      expect(visitor.onLog).not.toHaveBeenCalled();
    },
  );

  it("offers visitors sign-in for their ranking and keeps public courses available", () => {
    const { nav, onSignIn } = openNav(null);
    fireEvent.click(nav.getByRole("button", { name: "My ranking" }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(nav.getByRole("link", { name: "Courses" })).toHaveAttribute(
      "href",
      "/courses",
    );
  });
});
