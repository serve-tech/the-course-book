import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiSchemas } from "../lib/api/client";
import {
  isLayoutPreviewEnabled,
  LAYOUT_PREFERENCE_KEY,
  LayoutMode,
} from "../features/shell/layout-preview";
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

const loadHome = (path = "/") =>
  clientLoader({ request: new Request("https://coursebook.test" + path) });

beforeEach(() => {
  localStorage.clear();
  boundary.token.mockReset().mockResolvedValue("test-token");
  boundary.fetch.mockReset();
});

describe("home loader", () => {
  it("does not request private data for a visitor", async () => {
    boundary.token.mockResolvedValue(null);
    expect(await loadHome()).toEqual({ signedIn: false });
    expect(boundary.fetch).not.toHaveBeenCalled();
  });

  it.each([
    null,
    ...(!isLayoutPreviewEnabled() ? [LayoutMode.CourseFirst] : []),
  ])(
    "loads the Classic feed for preference %s and never requests the ranking",
    async (preference) => {
      if (preference) localStorage.setItem(LAYOUT_PREFERENCE_KEY, preference);
      boundary.fetch.mockImplementation((request) =>
        Promise.resolve(
          Response.json(
            new URL(request.url).pathname === "/v1/feed"
              ? { items: [], nextCursor: null }
              : { members: [], nextCursor: null },
          ),
        ),
      );
      expect(await loadHome()).toMatchObject({
        signedIn: true,
        layout: LayoutMode.Classic,
        hasFriends: false,
        first: { items: [] },
      });
      expect(
        boundary.fetch.mock.calls
          .map(([request]) => new URL(request.url).pathname)
          .sort(),
      ).toEqual(["/v1/feed", "/v1/members"]);
    },
  );

  it.each([
    LayoutMode.Classic,
    ...(isLayoutPreviewEnabled() ? [LayoutMode.CourseFirst] : []),
  ])(
    "sends Home Log links to the member's Ranking dialog in %s",
    async (preference) => {
      localStorage.setItem(LAYOUT_PREFERENCE_KEY, preference);
      boundary.fetch.mockResolvedValue(Response.json({ username: "golfer" }));
      const response: unknown = await loadHome("/?log=1").catch(
        (error: unknown) => error,
      );
      if (!(response instanceof Response))
        throw new Error("Expected a redirect response");
      expect(response.status).toBe(302);
      expect(response.headers.get("Location")).toBe("/u/golfer/ranking?log=1");
      expect(
        boundary.fetch.mock.calls.map(
          ([request]) => new URL(request.url).pathname,
        ),
      ).toEqual(["/v1/me"]);
    },
  );

  it.skipIf(!isLayoutPreviewEnabled())(
    "loads list progress, the newest feed items and the member's courses in parallel when opted in",
    async () => {
      localStorage.setItem(LAYOUT_PREFERENCE_KEY, LayoutMode.CourseFirst);
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
          state: 4,
        },
      };
      const friend = { username: "friend", displayName: "A Friend" };
      const bodies: Record<string, unknown> = {
        "/v1/top-lists": {
          lists: [
            {
              list: {
                type: "state",
                scope: "MI",
                title: "Best in Michigan",
                size: 100,
                source: "Test",
                sourceYear: 2026,
              },
              mine: 1,
              friends: [{ member: friend, played: 3 }],
            },
          ],
        },
        "/v1/feed": {
          items: [
            {
              id: "item-1",
              type: "round",
              at: "2026-10-01T12:00:00Z",
              member: friend,
              rounds: [
                {
                  id: "c0a9c1f3-7f0e-4a51-9a52-2a8f3c1d9e01",
                  course,
                  playedOn: "2026-09-30",
                  visit: 1,
                  rank: 2,
                },
              ],
              count: 1,
            },
          ],
          nextCursor: null,
        },
        "/v1/me/courses": { courses: [{ course, rank: 1, played: 3 }] },
      };
      boundary.fetch.mockImplementation((request) =>
        Promise.resolve(Response.json(bodies[new URL(request.url).pathname])),
      );
      expect(await loadHome()).toMatchObject({
        signedIn: true,
        layout: LayoutMode.CourseFirst,
        standings: [
          {
            list: { type: "state", scope: "MI", size: 100 },
            mine: 1,
            friends: [{ member: friend, played: 3 }],
          },
        ],
        activity: [{ id: "item-1", member: friend }],
        rows: [
          { course: { id: course.id, name: "Home Links" }, rank: 1, played: 3 },
        ],
      });
      const requests = boundary.fetch.mock.calls.map(
        ([request]) => new URL(request.url),
      );
      expect(requests.map((url) => url.pathname).sort()).toEqual([
        "/v1/feed",
        "/v1/me/courses",
        "/v1/top-lists",
      ]);
      expect(
        requests.find((url) => url.pathname === "/v1/feed")?.searchParams.get(
          "limit",
        ),
      ).toBe("12");
    },
  );

  it("passes failed reads to the route error boundary instead of showing an empty page", async () => {
    localStorage.setItem(LAYOUT_PREFERENCE_KEY, LayoutMode.CourseFirst);
    boundary.fetch.mockImplementation(() =>
      Promise.resolve(
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
      ),
    );
    await expect(loadHome()).rejects.toMatchObject({
      status: 500,
      code: "internal",
    });
  });
});
