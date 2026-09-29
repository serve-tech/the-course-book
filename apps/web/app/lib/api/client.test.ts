import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, createSlowTracker, unwrap } from "./client";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function recordingClient(response: () => Response, token: string | null = "tok") {
  const requests: Request[] = [];
  const client = createApiClient({
    baseUrl: "https://api.example",
    getToken: () => Promise.resolve(token),
    fetch: (request: Request) => {
      requests.push(request);
      return Promise.resolve(response());
    },
  });
  return { client, requests };
}

describe("API client", () => {
  it("sends the session token on member operations without cookies", async () => {
    const { client, requests } = recordingClient(() => json(200, { username: "g", displayName: "G" }));
    await client.GET("/v1/me");
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer tok");
    expect(requests[0]?.credentials).toBe("omit");
  });

  it("sends no token on public operations", async () => {
    const { client, requests } = recordingClient(() => json(200, { entries: [] }));
    await client.GET("/v1/rankings");
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  it("sends no header when signed out", async () => {
    const { client, requests } = recordingClient(() => json(401, {}), null);
    await client.GET("/v1/me");
    expect(requests[0]?.headers.get("authorization")).toBeNull();
  });

  it("turns an error envelope into an ApiError", async () => {
    const envelope = { error: { code: "not_on_list", message: "That course is not on your list.", requestId: "r1", fields: null } };
    const { client } = recordingClient(() => json(404, envelope));
    const result = await client.DELETE("/v1/me/courses/{courseId}", { params: { path: { courseId: "11111111-1111-4111-8111-111111111111" } } });
    expect(() => unwrap(result)).toThrow(ApiError);
    expect(() => unwrap(result)).toThrow(expect.objectContaining({ status: 404, code: "not_on_list", requestId: "r1" }));
  });

  it("reports a non-envelope failure generically", async () => {
    const { client } = recordingClient(() => new Response("Bad gateway", { status: 502 }));
    const result = await client.GET("/v1/me");
    expect(() => unwrap(result)).toThrow(expect.objectContaining({ status: 502, code: "http_502" }));
  });
});

describe("slow request tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports slow once a request outlasts the delay and clear when all slow ones settle", () => {
    const changes: boolean[] = [];
    const tracker = createSlowTracker(3000, (slow) => changes.push(slow));
    const first = tracker.start();
    const second = tracker.start();
    vi.advanceTimersByTime(2999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);
    first();
    expect(changes).toEqual([true]);
    second();
    expect(changes).toEqual([true, false]);
  });

  it("never reports requests that finish in time", () => {
    const changes: boolean[] = [];
    const tracker = createSlowTracker(3000, (slow) => changes.push(slow));
    tracker.start()();
    vi.advanceTimersByTime(10_000);
    expect(changes).toEqual([]);
  });
});
