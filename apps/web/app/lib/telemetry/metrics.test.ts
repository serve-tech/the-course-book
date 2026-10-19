import { describe, expect, it } from "vitest";
import { duration, eventProperties, failureOutcome, Metric, Outcome, routeLabel, serverDurations } from "./metrics";
import { telemetryConfig } from "./config";

describe("telemetry boundaries", () => {
  it.each([
    ["/u/private-person", "/u/:username"],
    ["/u/private-person/lists/state-mi", "/u/:username/lists/:list"],
    ["/u/private-person/ranking", "/u/:username/ranking"],
    ["/friends/private-person", "/friends/:username"],
    ["/sign-in/sso-callback", "/sign-in/*"],
    ["/unknown-private-data", "unknown"],
    ["/courses", "/courses"],
  ])("groups %s without personal URL segments", (path, expected) => { expect(routeLabel(path)).toBe(expected); });

  it("retains only allowlisted event fields", () => {
    const result = eventProperties.parse({ metric: Metric.Auth, duration_ms: 50, outcome: Outcome.Success, route: "/", layout: "classic", release: "local", environment: "test", $current_url: "https://example.com/?token=private", $referrer: "secret", email: "private", $set: { name: "private" } });
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.duration_ms).toBe(50);
  });

  it.each([-1, NaN, Infinity])("rejects invalid duration %s on an otherwise valid event", (ms) => {
    const valid = { metric: Metric.Auth, duration_ms: 50, outcome: Outcome.Success, route: "/", layout: "classic", release: "local", environment: "test" };
    expect(eventProperties.safeParse(valid).success).toBe(true);
    expect(eventProperties.safeParse({ ...valid, duration_ms: ms }).success).toBe(false);
  });
  it("parses only our named numeric server timings", () => {
    expect(serverDurations("app;dur=50, auth;dur=12.5, provision;dur=2, query;desc=private, app;dur=NaN")).toEqual({ server_ms: 50, server_auth_ms: 12.5, server_provision_ms: 2 });
    expect(serverDurations(null)).toEqual({});
  });
  it("separates cancellation from timeout and failures", () => {
    expect(failureOutcome(new DOMException("private", "AbortError"))).toBe(Outcome.Cancelled);
    expect(failureOutcome(new DOMException("private", "TimeoutError"))).toBe(Outcome.Timeout);
    expect(failureOutcome(new Error("private"))).toBe(Outcome.Error);
    expect(duration(10, 12.7)).toBe(3);
  });
  it("allows unconfigured monitoring but rejects partial configuration and personal keys", () => {
    expect(telemetryConfig(undefined, "")).toBeNull();
    expect(telemetryConfig("phc_test", "https://us.i.posthog.com")).toEqual({ key: "phc_test", host: "https://us.i.posthog.com" });
    expect(() => telemetryConfig("phx_personal", "https://us.i.posthog.com")).toThrow();
    expect(() => telemetryConfig("phc_test", undefined)).toThrow();
    expect(() => telemetryConfig("phc_test", "https://arbitrary.example")).toThrow();
  });
});
