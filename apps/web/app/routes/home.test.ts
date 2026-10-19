import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiSchemas } from "../lib/api/client";
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
    expect(await clientLoader()).toEqual({ signedIn: false });
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it("loads the member's courses without requesting the feed or a profile", async () => {
    const course: ApiSchemas["Course"] = {
      id: "b13e97cb-640b-4124-8366-564138abc168",
      name: "Home Links",
      location: "Detroit, MI, USA",
      city: "Detroit",
      state: "MI",
      country: "USA",
      logoUrl: null,
      websiteUrl: null,
      ranks: {
        global: null,
        world: null,
        usa: null,
        usaPublic: null,
        state: null,
      },
    };
    boundary.fetch.mockResolvedValue(
      Response.json({ courses: [{ course, rank: 1, played: 3 }] }),
    );
    expect(await clientLoader()).toMatchObject({
      signedIn: true,
      rows: [
        { course: { id: course.id, name: "Home Links" }, rank: 1, played: 3 },
      ],
    });
    expect(
      boundary.fetch.mock.calls.map(
        ([request]) => new URL(request.url).pathname,
      ),
    ).toEqual(["/v1/me/courses"]);
  });

  it("passes failed reads to the route error boundary instead of showing an empty ranking", async () => {
    boundary.fetch.mockResolvedValue(
      Response.json(
        {
          error: {
            code: "internal",
            message: "Try again",
            requestId: "test",
            fields: null,
          },
        },
        { status: 500 },
      ),
    );
    await expect(clientLoader()).rejects.toMatchObject({
      status: 500,
      code: "internal",
    });
  });
});
