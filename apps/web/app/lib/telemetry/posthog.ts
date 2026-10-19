import type { CaptureResult, PostHogConfig } from "posthog-js/dist/module.slim.js";
import { eventProperties } from "./metrics";

export const PERFORMANCE_EVENT = "coursebook_performance";
let warnedInvalidEvent = false;

export function sanitizeEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || event.event !== PERFORMANCE_EVENT) return null;
  const properties = eventProperties.safeParse(event.properties);
  if (!properties.success) {
    if (!warnedInvalidEvent) {
      warnedInvalidEvent = true;
      console.warn("Dropped invalid performance measurement fields:", properties.error.issues.map((issue) => issue.path.join(".")));
    }
    return null;
  }
  return {
    uuid: event.uuid,
    event: PERFORMANCE_EVENT,
    properties: properties.data,
    ...(event.timestamp ? { timestamp: event.timestamp } : {}),
  };
}

/** Explicit opt-ins only. The dashboard cannot remotely enable broader collection. */
export function posthogOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    persistence: "memory",
    disable_persistence: true,
    person_profiles: "never",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_performance: false,
    capture_exceptions: false,
    capture_webmcp: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    enable_recording_console_log: false,
    rageclick: false,
    disable_web_experiments: true,
    ip: false,
    respect_dnt: true,
    before_send: sanitizeEvent,
  };
}
