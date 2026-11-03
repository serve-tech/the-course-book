import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen";

afterEach(cleanup);

describe("first-load screen", () => {
  it("shows the brand mark over the site background and tells screen readers the app is loading", () => {
    const { container } = render(<LoadingScreen />);
    const status = screen.getByRole("status");
    expect(status).toHaveClass("app");
    expect(status).toHaveTextContent("Loading The Course Book");
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
