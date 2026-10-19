import { getToken as clerkToken } from "@clerk/react-router";
import { recordMeasurement } from "./telemetry";
import { duration, failureOutcome, Metric, Outcome } from "./telemetry/metrics";

/** Measures SDK/token readiness, not time a person spends typing credentials. */
export async function getToken(): Promise<string | null> {
  const started = performance.now();
  let outcome = Outcome.Success;
  try {
    return await clerkToken();
  } catch (error) {
    outcome = failureOutcome(error);
    throw error;
  } finally {
    recordMeasurement({ metric: Metric.Auth, duration_ms: duration(started, performance.now()), outcome, source: "loader" });
  }
}
