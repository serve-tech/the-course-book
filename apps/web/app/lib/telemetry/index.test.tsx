import { beforeEach, expect, it, vi } from "vitest";
import { Metric, Outcome } from "./metrics";

const sdk = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js/dist/module.slim.js", () => ({ default: sdk }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  vi.stubEnv("VITE_POSTHOG_KEY", "phc_test");
  vi.stubEnv("VITE_POSTHOG_HOST", "https://us.i.posthog.com");
});

it("queues early measurements until the SDK loads and initializes just once", async () => {
  const telemetry = await import("./index");
  telemetry.recordMeasurement({ metric: Metric.Auth, duration_ms: 5, outcome: Outcome.Success });
  telemetry.initializeTelemetry();
  await vi.waitFor(() => { expect(sdk.capture).toHaveBeenCalledTimes(1); });
  expect(sdk.init).toHaveBeenCalledTimes(1);
  expect(sdk.capture).toHaveBeenCalledWith("coursebook_performance", expect.objectContaining({ metric: Metric.Auth, duration_ms: 5, route: "unknown", visible_route: "/" }));
});

it("does nothing without a project configured", async () => {
  vi.stubEnv("VITE_POSTHOG_KEY", "");
  vi.stubEnv("VITE_POSTHOG_HOST", "");
  const telemetry = await import("./index");
  telemetry.recordMeasurement({ metric: Metric.Auth, duration_ms: 5, outcome: Outcome.Success });
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.capture).not.toHaveBeenCalled();
});

it("continues after an SDK initialization failure without sending raw errors", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  sdk.init.mockImplementationOnce(() => { throw new Error("private details"); });
  const telemetry = await import("./index");
  telemetry.recordMeasurement({ metric: Metric.Auth, duration_ms: 5, outcome: Outcome.Success });
  await vi.waitFor(() => { expect(warning).toHaveBeenCalled(); });
  expect(sdk.capture).not.toHaveBeenCalled();
  expect(JSON.stringify(warning.mock.calls)).not.toContain("private");
});
