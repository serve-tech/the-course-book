import { readLayoutPreference } from "../../features/shell/layout-preference";
import { telemetryConfig } from "./config";
import { routeLabel, type Measurement } from "./metrics";
import { PERFORMANCE_EVENT, posthogOptions } from "./posthog";

type Properties = Measurement & { route: string; visible_route: string; layout: string; release: string; environment: string };
type Capture = (properties: Properties) => void;
let capture: Capture | undefined;
let starting = false;
let disabled = false;
const pending: Properties[] = [];
const MAX_PENDING = 100;

/** Browser calls only. Downloading or sending telemetry never blocks application work. */
export function initializeTelemetry(): void {
  if (starting || disabled) return;
  let config: ReturnType<typeof telemetryConfig>;
  try {
    config = telemetryConfig(import.meta.env.VITE_POSTHOG_KEY, import.meta.env.VITE_POSTHOG_HOST);
  } catch {
    console.warn("Performance monitoring disabled: invalid PostHog configuration.");
    disabled = true;
    pending.length = 0;
    return;
  }
  if (!config) {
    disabled = true;
    pending.length = 0;
    return;
  }
  starting = true;
  const { key, host } = config;
  void import("posthog-js/dist/module.slim.js").then(({ default: posthog }) => {
    posthog.init(key, posthogOptions(host));
    capture = (properties) => { posthog.capture(PERFORMANCE_EVENT, properties); };
    for (const properties of pending.splice(0)) capture(properties);
  }).catch(() => {
    disabled = true;
    pending.length = 0;
    console.warn("Performance monitoring unavailable; the app will continue normally.");
  });
}

export function recordMeasurement(measurement: Measurement): void {
  try {
    initializeTelemetry();
    if (disabled) return;
    const properties: Properties = {
      ...measurement,
      route: measurement.route ?? "unknown",
      visible_route: routeLabel(window.location.pathname),
      layout: readLayoutPreference(),
      release: import.meta.env.VITE_APP_RELEASE || "local",
      environment: import.meta.env.MODE === "test" ? "test" : import.meta.env.DEV ? "development" : "production",
    };
    if (capture) capture(properties);
    else if (pending.length < MAX_PENDING) pending.push(properties);
  } catch {
    console.warn("Could not record a performance measurement.");
  }
}
