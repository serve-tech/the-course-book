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
  function openNav(user: NavMember | null = member, path = "/") {
    const onSignIn = vi.fn();
    const onLog = vi.fn();
    const router = createMemoryRouter(
      [
        {
          path: "*",
          element: (
            <Bar
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

  it("leads with Home, with friends one tap away and Activity out of the way", () => {
    const { nav } = openNav();
    expect(nav.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual(["/", "/courses", "/friends", "/u/golfer"]);
    expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByLabelText("2 friend requests")).toBeInTheDocument();
  });

  it("marks Profile, not Home, on any of the member's profile tabs", () => {
    const { nav } = openNav(member, "/u/golfer/stats");
    expect(nav.getByRole("link", { name: "Profile" })).toHaveAttribute("aria-current", "page");
    expect(nav.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it.runIf(Bar === TabBar)("opens Log a round over the current page, and sign-in for visitors", () => {
    const signedIn = openNav(member, "/courses");
    fireEvent.click(signedIn.nav.getByRole("button", { name: "Log a round" }));
    expect(signedIn.onLog).toHaveBeenCalledOnce();
    expect(signedIn.onSignIn).not.toHaveBeenCalled();
    cleanup();
    const visitor = openNav(null, "/courses");
    fireEvent.click(visitor.nav.getByRole("button", { name: "Log a round" }));
    expect(visitor.onSignIn).toHaveBeenCalledOnce();
    expect(visitor.onLog).not.toHaveBeenCalled();
  });

  it("offers visitors sign-in for their profile and keeps public courses available", () => {
    const { nav, onSignIn } = openNav(null);
    fireEvent.click(nav.getByRole("button", { name: "Profile" }));
    expect(onSignIn).toHaveBeenCalledOnce();
    expect(nav.getByRole("link", { name: "Courses" })).toHaveAttribute("href", "/courses");
  });
});
