import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "./AccountMenu";

const member = { username: "jlinneburg", displayName: "Joshua Linneburg" };

function renderMenu(canCurate = false) {
  const onSignOut = vi.fn();
  const onNavigate = vi.fn();
  const router = createMemoryRouter(
    [{ path: "*", element: <AccountMenu member={member} canCurate={canCurate} onSignOut={onSignOut} onNavigate={onNavigate} /> }],
  );
  render(<RouterProvider router={router} />);
  const button = screen.getByRole("button", { name: "Account menu for Joshua Linneburg" });
  return { button, onSignOut, onNavigate, router };
}

describe("AccountMenu", () => {
  afterEach(cleanup);

  it("opens under the avatar with who is signed in, Profile, Activity, Account and Sign out", () => {
    const { button } = renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Joshua Linneburg")).toBeInTheDocument();
    expect(screen.getByText("@jlinneburg")).toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Profile", "Activity", "Account", "Sign out"]);
    expect(screen.getByRole("menuitem", { name: "Profile" })).toHaveAttribute("href", "/u/jlinneburg");
    expect(screen.getByRole("menuitem", { name: "Account" })).toHaveAttribute("href", "/account");
  });

  it("adds Course photos for a curator", () => {
    const { button } = renderMenu(true);
    fireEvent.click(button);
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Profile", "Activity", "Course photos", "Account", "Sign out"]);
    expect(screen.getByRole("menuitem", { name: "Course photos" })).toHaveAttribute("href", "/curate");
  });

  it("signs out and closes", () => {
    const { button, onSignOut } = renderMenu();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("navigates to the profile and closes", () => {
    const { button, onNavigate, router } = renderMenu();
    fireEvent.click(button);
    fireEvent.click(screen.getByRole("menuitem", { name: "Profile" }));
    expect(router.state.location.pathname).toBe("/u/jlinneburg");
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and when the avatar is clicked again", () => {
    const { button } = renderMenu();
    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
