import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiSchemas } from "../lib/api/client";
import {
  isLayoutPreviewEnabled,
  LAYOUT_PREFERENCE_KEY,
  LayoutMode,
} from "../features/shell/layout-preview";
import { GoalReason } from "../features/home/goal-list";
import { HOME_GOAL_LIST_KEY, SELECTED_STATE_KEY } from "../shared/lib/storage";
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

  describe.skipIf(!isLayoutPreviewEnabled())("opted in", () => {
    const course: ApiSchemas["Course"] = {
      id: "b13e97cb-640b-4124-8366-564138abc168",
      name: "Home Links",
      location: "Detroit, MI, USA",
      city: "Detroit",
      state: "MI",
      country: "USA",
      logoUrl: null,
      websiteUrl: null,
      ranks: { global: null, world: null, usa: 40, usaPublic: null, state: 4 },
    };
    const friend = { username: "friend", displayName: "A Friend" };
    const progress = (type: string, scope: string, title: string, mine: number) => ({
      list: { type, scope, title, size: 100, source: "Test", sourceYear: 2026 },
      mine,
      friends: [{ member: friend, played: 3 }],
    });
    const usa = progress("usa", "USA", "USA Top 100", 2);
    const michigan = progress("state", "MI", "Best in Michigan", 1);
    const detail = (standing: typeof usa, rank: number) => ({
      progress: standing,
      entries: [{ course, rank, played: 0, wantToPlay: true, friendsPlayed: [friend] }],
    });
    const bodies: Record<string, unknown> = {
      "/v1/top-lists": { lists: [usa, michigan] },
      "/v1/top-lists/usa/USA": detail(usa, 40),
      "/v1/top-lists/state/MI": detail(michigan, 4),
      "/v1/feed": {
        items: [
          {
            id: "item-1",
            type: "round",
            at: "2026-10-01T12:00:00Z",
            member: friend,
            rounds: [{ id: "c0a9c1f3-7f0e-4a51-9a52-2a8f3c1d9e01", course, playedOn: "2026-09-30", visit: 1, rank: 2 }],
            count: 1,
          },
        ],
        nextCursor: null,
      },
      "/v1/me/courses": { courses: [{ course, rank: 1, played: 3 }] },
    };
    const requested = () => boundary.fetch.mock.calls.map(([request]) => new URL(request.url));

    beforeEach(() => {
      localStorage.setItem(LAYOUT_PREFERENCE_KEY, LayoutMode.CourseFirst);
      localStorage.setItem(SELECTED_STATE_KEY, "mi");
      boundary.fetch.mockImplementation((request) => {
        const body = bodies[new URL(request.url).pathname];
        return Promise.resolve(body ? Response.json(body) : Response.json({}, { status: 404 }));
      });
    });

    it("tracks the home state's list and loads its courses with progress, friends' rounds and the ranking", async () => {
      expect(await loadHome()).toMatchObject({
        signedIn: true,
        layout: LayoutMode.CourseFirst,
        homeState: "MI",
        standings: [{ list: { scope: "USA" } }, { list: { scope: "MI" }, mine: 1, friends: [{ member: friend, played: 3 }] }],
        goal: { standing: { list: { scope: "MI" } }, reason: GoalReason.HomeState },
        goalCourses: [{ course: { id: course.id }, rank: 4, wantToPlay: true, friendsPlayed: [friend] }],
        activity: [{ id: "item-1", member: friend }],
        rows: [{ course: { id: course.id, name: "Home Links" }, rank: 1, played: 3 }],
      });
      expect(requested().map((url) => url.pathname).sort()).toEqual([
        "/v1/feed",
        "/v1/me/courses",
        "/v1/top-lists",
        "/v1/top-lists/state/MI",
      ]);
      expect(requested().find((url) => url.pathname === "/v1/feed")?.searchParams.get("limit")).toBe("12");
    });

    it.each([
      { name: "the list picked on this browser", path: "/", stored: "usa" },
      { name: "a list named in the URL over the stored pick", path: "/?goal=usa", stored: "state-mi" },
    ])("tracks $name", async ({ path, stored }) => {
      localStorage.setItem(HOME_GOAL_LIST_KEY, stored);
      expect(await loadHome(path)).toMatchObject({
        goal: { standing: { list: { scope: "USA" } }, reason: GoalReason.Chosen },
        goalCourses: [{ rank: 40 }],
      });
      expect(requested().map((url) => url.pathname)).toContain("/v1/top-lists/usa/USA");
      expect(requested().map((url) => url.pathname)).not.toContain("/v1/top-lists/state/MI");
    });
  });

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
