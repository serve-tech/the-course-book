import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import type { ApiSchemas } from "../../lib/api/client";
import { LogRoundDialog } from "./LogRoundDialog";

const transport = vi.hoisted(() => vi.fn<(request: Request) => Promise<Response>>());
vi.mock("@clerk/react-router", () => ({ getToken: () => Promise.resolve("test-token") }));
vi.mock("../../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../lib/api")>();
  const { createApiClient } = await import("../../lib/api/client");
  return { ...original, api: createApiClient({ baseUrl: "https://api.example.test", getToken: () => Promise.resolve("test-token"), fetch: transport }) };
});

const hit = (name: string): ApiSchemas["SearchHit"] => ({
  courseId: null,
  course: { name, location: "Rochester, MI, USA", city: "Rochester", state: "MI", country: "USA", logoUrl: null, websiteUrl: null },
  ranks: { world: null, global: null, usa: null, usaPublic: null, state: null },
});
const first = Array.from({ length: 10 }, (_, i) => hit(`Oakland Course ${i + 1}`));
const second = [hit("Oakland University: Katke-Cousins")];
const response = (results: ApiSchemas["SearchHit"][], page = 1, total = 11) => Response.json({ results, page, pageSize: 10, total });
const routers: ReturnType<typeof createMemoryRouter>[] = [];

function deferredResponse() {
  let resolve: (response: Response) => void = () => { throw new Error("response not initialized"); };
  const promise = new Promise<Response>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function openDialog() {
  const router = createMemoryRouter([{
    path: "/",
    element: <LogRoundDialog signedIn played={{}} onClose={() => undefined} onSignIn={() => undefined} notify={() => undefined} />,
  }]);
  routers.push(router);
  render(<RouterProvider router={router} />);
}
const search = (query: string) => fireEvent.change(screen.getByLabelText("Course"), { target: { value: query } });

beforeEach(() => {
  transport.mockReset();
  transport.mockImplementation((request) => {
    const query = new URL(request.url).searchParams;
    if (query.get("q") === "Pine") return Promise.resolve(response([hit("Pine Valley")], 1, 1));
    return Promise.resolve(query.get("page") === "2" ? response(second, 2) : response(first));
  });
});
afterEach(() => {
  cleanup();
  for (const router of routers.splice(0)) router.dispose();
});

describe("course search pages", () => {
  it("loads pages from the API, disables the boundaries and selects a later result", async () => {
    openDialog();
    search("Oakland");
    expect(screen.getByText("Searching courses…")).toBeVisible();
    expect(screen.queryByText("No courses found.")).not.toBeInTheDocument();
    await screen.findByText(/11 courses · A–Z · Page 1 of 2/);
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Oakland University: Katke-Cousins");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    expect(screen.queryByText("Oakland Course 1")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("Oakland Course 1");
    expect(transport.mock.calls.map(([request]) => new URL(request.url).searchParams.get("page"))).toEqual(["1", "2", "1"]);
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: /Oakland University: Katke-Cousins/ }));
    expect(screen.getByRole("button", { name: "Log Round" })).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Course search pages" })).not.toBeInTheDocument();
  });

  it("resets a changed query to page one and ignores the canceled page response", async () => {
    const pending = deferredResponse();
    const serve = transport.getMockImplementation();
    if (!serve) throw new Error("missing transport");
    transport.mockImplementation((request) => new URL(request.url).searchParams.get("page") === "2" ? pending.promise : serve(request));
    openDialog();
    search("Oakland");
    await screen.findByText("Oakland Course 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => { expect(transport).toHaveBeenCalledTimes(2); });
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    search("Pine");
    await screen.findByText("Pine Valley");
    const latest = new URL(transport.mock.calls.at(-1)?.[0].url ?? "https://invalid.test");
    expect([latest.searchParams.get("q"), latest.searchParams.get("page")]).toEqual(["Pine", "1"]);
    expect(transport.mock.calls[1]?.[0].signal.aborted).toBe(true);
    await act(async () => {
      pending.resolve(response(second, 2));
      await pending.promise;
    });
    expect(screen.queryByText("Oakland University: Katke-Cousins")).not.toBeInTheDocument();
    expect(screen.getByText("Pine Valley")).toBeVisible();
  });

  it("retries a failed later page without returning to page one", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    transport.mockResolvedValueOnce(response(first)).mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(response(second, 2));
    openDialog();
    search("Oakland");
    await screen.findByText("Oakland Course 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Oakland University: Katke-Cousins");
    expect(transport.mock.calls.map(([request]) => new URL(request.url).searchParams.get("page"))).toEqual(["1", "2", "2"]);
    expect(warn).toHaveBeenCalled();
  });

  it("calls external discovery only on request and resets the source for a new query", async () => {
    openDialog();
    search("Oakland");
    await screen.findByText("Oakland Course 1");
    expect(new URL(transport.mock.calls[0]?.[0].url ?? "https://invalid.test").searchParams.get("source")).toBe("catalog");
    expect(transport).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Search more courses" }));
    await waitFor(() => { expect(transport).toHaveBeenCalledTimes(2); });
    expect(new URL(transport.mock.calls[1]?.[0].url ?? "https://invalid.test").searchParams.get("source")).toBe("external");
    await screen.findByText("Oakland Course 1");
    fireEvent.click(screen.getByRole("button", { name: "Back to catalog" }));
    await waitFor(() => { expect(transport).toHaveBeenCalledTimes(3); });
    expect(new URL(transport.mock.calls[2]?.[0].url ?? "https://invalid.test").searchParams.get("source")).toBe("catalog");
    await screen.findByText("Oakland Course 1");
    fireEvent.click(screen.getByRole("button", { name: "Search more courses" }));
    await screen.findByText("Oakland Course 1");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Oakland University: Katke-Cousins");
    search("Pine");
    await screen.findByText("Pine Valley");
    const query = new URL(transport.mock.calls.at(-1)?.[0].url ?? "https://invalid.test").searchParams;
    expect([query.get("source"), query.get("page")]).toEqual(["catalog", "1"]);
  });

  it("recovers from an invalid successful response instead of remaining stuck loading", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    transport.mockResolvedValueOnce(Response.json({ results: [{ courseId: null, course: null }], page: 1, pageSize: 10, total: 1 }));
    openDialog();
    search("Oakland");
    await screen.findByRole("alert");
    expect(screen.queryByText("Searching courses…")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Oakland Course 1");
  });

  it("does not silently fall back when the catalog has no matches", async () => {
    transport.mockResolvedValue(response([], 1, 0));
    openDialog();
    search("Missing");
    await screen.findByText("No courses found in our catalog. Try Search more courses.");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Search more courses" })).toBeEnabled();
    expect(screen.queryByRole("group", { name: "Course search pages" })).not.toBeInTheDocument();
  });

  it("clears results and pagination when the query becomes too short", async () => {
    openDialog();
    search("Oakland");
    await screen.findByText("Oakland Course 1");
    search("O");
    expect(screen.getByText("Start typing a course name.")).toBeVisible();
    expect(screen.queryByRole("group", { name: "Course search pages" })).not.toBeInTheDocument();
    expect(screen.queryByText("Oakland Course 1")).not.toBeInTheDocument();
  });
});
