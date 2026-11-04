import { beforeEach, describe, expect, it, vi } from "vitest";
import { clientLoader } from "./home";

const boundary = vi.hoisted(() => ({
  token: vi.fn<() => Promise<string | null>>(),
  fetch: vi.fn<(request: Request) => Promise<Response>>(),
}));
vi.mock("@clerk/react-router", () => ({ getToken: boundary.token }));
vi.mock("../lib/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("../lib/api")>();
  const { createApiClient } = await import("../lib/api/client");
  return {
    ...original,
    api: createApiClient({
      baseUrl: "https://api.example.test",
      getToken: boundary.token,
      fetch: boundary.fetch,
    }),
  };
});

beforeEach(() => {
  boundary.token.mockReset().mockResolvedValue("test-token");
  boundary.fetch.mockReset();
});

describe("home loader", () => {
  it("does not request private data for a visitor", async () => {
    boundary.token.mockResolvedValue(null);
    await expect(clientLoader()).resolves.toEqual({ signedIn: false });
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it("loads the member's ranking and nothing else", async () => {
    boundary.fetch.mockResolvedValue(Response.json({ courses: [] }));
    await expect(clientLoader()).resolves.toEqual({ signedIn: true, rows: [] });
    expect(boundary.fetch.mock.calls.map(([request]) => new URL(request.url).pathname)).toEqual(["/v1/me/courses"]);
  });

  it("lets a failed load reach the route's error boundary", async () => {
    boundary.fetch.mockResolvedValue(
      Response.json({ error: { code: "internal", message: "Something went wrong.", requestId: "r", fields: null } }, { status: 500 }),
    );
    await expect(clientLoader()).rejects.toThrow("Something went wrong.");
  });
});
