import { describe, expect, it } from "vitest";
import { Metric, Outcome } from "./metrics";
import { PERFORMANCE_EVENT, posthogOptions, sanitizeEvent } from "./posthog";

describe("PostHog collection", () => {
  it("strips SDK URL enrichment and rejects unrelated automatic events", () => {
    const event = { event: PERFORMANCE_EVENT, uuid: "test", timestamp: new Date(), $set: { name: "private" }, $set_once: { $initial_current_url: "secret" }, properties: {
      metric: Metric.Api, duration_ms: 120, outcome: Outcome.Success, route: "/u/:username", layout: "classic", release: "test", environment: "test",
      $current_url: "https://example.com/u/private?token=secret", $referrer: "https://secret", $set_once: { $initial_current_url: "secret" },
      $browser: "Chrome", $device_type: "Mobile", distinct_id: "anonymous", token: "phc_test",
    } };
    const cleaned = sanitizeEvent(event);
    expect(cleaned?.properties).toMatchObject({ duration_ms: 120, $browser: "Chrome", $device_type: "Mobile", token: "phc_test" });
    expect(JSON.stringify(cleaned)).not.toMatch(/secret|private/);
    expect(sanitizeEvent({ ...event, event: "$autocapture" })).toBeNull();
    expect(sanitizeEvent({ ...event, properties: { ...event.properties, duration_ms: NaN } })).toBeNull();
  });
  it("disables recording, automatic capture, persistent identity and remote features", () => {
    expect(posthogOptions("https://us.i.posthog.com")).toMatchObject({ autocapture: false, capture_pageview: false, capture_exceptions: false, disable_session_recording: true, persistence: "memory", disable_persistence: true, person_profiles: "never", advanced_disable_flags: true, disable_external_dependency_loading: true, respect_dnt: true });
  });
});
