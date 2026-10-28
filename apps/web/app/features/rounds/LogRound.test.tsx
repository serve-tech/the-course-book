import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiSchemas } from "../../lib/api/client";
import { LogRound } from "./LogRound";

const transport = vi.hoisted(() => vi.fn<(request: Request) => Promise<Response>>());
vi.mock("@clerk/react-router", () => ({ getToken: () => Promise.resolve("test-token") }));
vi.mock("../../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api")>();
  const { createApiClient } = await import("../../lib/api/client");
  return { ...original, api: createApiClient({ baseUrl: "https://api.example.test", getToken: () => Promise.resolve("test-token"), fetch: transport }) };
});

const pineValley: ApiSchemas["Course"] = {
  id: "5a0f4c1e-1d2b-4c3d-9e8f-0a1b2c3d4e5f",
  name: "Pine Valley",
  location: "Pine Valley, NJ, USA",
  city: "Pine Valley",
  state: "NJ",
  country: "USA",
  logoUrl: null,
  websiteUrl: null,
  ranks: { global: 1, world: null, usa: 1, usaPublic: null, state: 1 },
};
const hit: ApiSchemas["SearchHit"] = {
  courseId: pineValley.id,
  course: { name: pineValley.name, location: pineValley.location, city: pineValley.city, state: pineValley.state, country: pineValley.country, logoUrl: null, websiteUrl: null },
  ranks: { world: null, global: 1, usa: 1, usaPublic: null, state: 1 },
};
const routers: ReturnType<typeof createMemoryRouter>[] = [];

function openLog() {
  const onClose = vi.fn();
  const router = createMemoryRouter([
    { path: "/", element: <LogRound onClose={onClose} onSignIn={vi.fn()} notify={vi.fn()} /> },
  ]);
  routers.push(router);
  render(<RouterProvider router={router} />);
  return { onClose };
}

async function choosePineValley() {
  fireEvent.change(screen.getByLabelText("Course"), { target: { value: "Pine" } });
  fireEvent.click(await screen.findByRole("button", { name: /Pine Valley/ }));
}

beforeEach(() => {
  transport.mockReset();
  transport.mockImplementation((request) => {
    const path = new URL(request.url).pathname;
    if (path === "/v1/me/courses") return Promise.resolve(Response.json({ courses: [{ course: pineValley, rank: 1, played: 2 }] }));
    return Promise.resolve(Response.json({ results: [hit], page: 1, pageSize: 10, total: 1 }));
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const router of routers.splice(0)) router.dispose();
});

describe("Log a round over the current page", () => {
  it("notes how often the member already played the course they pick", async () => {
    openLog();
    await choosePineValley();
    expect(await screen.findByText(/Already played 2×/)).toBeVisible();
  });

  it("still logs without the note when the member's play counts fail to load", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing transport");
    transport.mockImplementation((request) =>
      new URL(request.url).pathname === "/v1/me/courses" ? Promise.resolve(new Response(null, { status: 500 })) : serve(request),
    );
    openLog();
    await choosePineValley();
    expect(screen.getByRole("button", { name: "Log Round" })).toBeEnabled();
    expect(screen.queryByText(/Already played/)).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalledWith("Could not load play counts for the Log dialog", expect.anything());
  });

  it("moves to the hand-entered course dialog when search cannot find the course", () => {
    openLog();
    fireEvent.click(screen.getByRole("button", { name: "+ Add Course" }));
    expect(screen.getByRole("dialog", { name: /Add/ })).toBeVisible();
    expect(screen.queryByLabelText("Course")).not.toBeInTheDocument();
  });
});
