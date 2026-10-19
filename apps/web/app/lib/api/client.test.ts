import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient, createSlowTracker, unwrap } from "./client";
import { Metric, Outcome, type Measurement } from "../telemetry/metrics";

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

describe("API measurements", () => {
  it("separates auth and response-header waits and correlates server timings, without parameters or tokens", async () => {
    const measurements: Measurement[] = [];
    let now = 10;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const client = createApiClient({
      baseUrl: "https://api.example",
      getToken: () => { now += 50; return Promise.resolve("secret-token"); },
      fetch: () => {
        now += 200;
        return Promise.resolve(new Response("{}", { headers: {
          "content-type": "application/json", "x-request-id": "11111111-1111-4111-8111-111111111111",
          "server-timing": "app;dur=150, auth;dur=40, provision;dur=10",
        } }));
      },
      onMeasurement: (measurement) => { measurements.push(measurement); },
    });
    await client.GET("/v1/members/{username}", { params: { path: { username: "private-name" } } });
    expect(measurements).toEqual([
      { metric: Metric.Auth, source: "api", duration_ms: 50, outcome: Outcome.Success, endpoint: "/v1/members/{username}" },
      { metric: Metric.Api, duration_ms: 200, outcome: Outcome.Success, endpoint: "/v1/members/{username}", method: "GET", status: 200, request_id: "11111111-1111-4111-8111-111111111111", server_ms: 150, server_auth_ms: 40, server_provision_ms: 10 },
    ]);
    expect(JSON.stringify(measurements)).not.toMatch(/private-name|secret-token/);
  });

  it.each([new Error("network"), new DOMException("cancelled", "AbortError"), new DOMException("timeout", "TimeoutError")])("preserves a transport failure and reports its category (%s)", async (error) => {
    const observe = vi.fn();
    const client = createApiClient({ baseUrl: "https://api.example", getToken: () => Promise.resolve(null), fetch: () => Promise.reject(error), onMeasurement: observe });
    await expect(client.GET("/v1/rankings")).rejects.toBe(error);
    expect(observe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ metric: Metric.Api, outcome: error.name === "AbortError" ? Outcome.Cancelled : error.name === "TimeoutError" ? Outcome.Timeout : Outcome.Error }));
  });

  it("reports HTTP failures and keeps successful data usable when the observer throws", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const observer = vi.fn(() => { throw new Error("monitor down"); });
    const client = createApiClient({ baseUrl: "https://api.example", getToken: () => Promise.resolve(null), fetch: () => Promise.resolve(json(503, {})), onMeasurement: observer });
    expect((await client.GET("/v1/rankings")).response.status).toBe(503);
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({ status: 503, outcome: Outcome.Error }));
    expect(warning).toHaveBeenCalled();
  });

  it("records token failures without making a request", async () => {
    const error = new Error("clerk failed");
    const send = vi.fn();
    const observe = vi.fn();
    const client = createApiClient({ baseUrl: "https://api.example", getToken: () => Promise.reject(error), fetch: send, onMeasurement: observe });
    await expect(client.GET("/v1/me")).rejects.toBe(error);
    expect(send).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ metric: Metric.Auth, outcome: Outcome.Error }));
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
