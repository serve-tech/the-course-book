import { useAuth } from "@clerk/react-router";
import { useEffect, useRef } from "react";
import { useLocation, useNavigation, useRevalidator } from "react-router";
import { initializeTelemetry, recordMeasurement } from "./index";
import { Metric, NavigationKind, Outcome, routeLabel } from "./metrics";
import { navigationTimer } from "./router";

/** Mounted with Clerk even while the initial route is still loading. */
export function AuthMetrics() {
  const { isLoaded } = useAuth();
  const recorded = useRef(false);
  useEffect(() => { initializeTelemetry(); }, []);
  useEffect(() => {
    // Browser history traversals bypass router.navigate instrumentation.
    const traverse = () => { navigationTimer.begin(NavigationKind.Navigation); };
    const visibility = () => {
      if (document.visibilityState === "hidden") navigationTimer.discard();
    };
    window.addEventListener("popstate", traverse);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("popstate", traverse);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!isLoaded || recorded.current) return;
    recorded.current = true;
    recordMeasurement({ metric: Metric.Clerk, duration_ms: Math.round(performance.now()), outcome: Outcome.Success });
  }, [isLoaded]);
  return null;
}

/** Two frames after an idle committed route approximate visible content, not just loaded data. */
export function NavigationMetrics() {
  const location = useLocation();
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  useEffect(() => {
    if (revalidator.state !== "idle") navigationTimer.beginRevalidation();
    if (navigation.state !== "idle" || revalidator.state !== "idle") return;
    const id = navigationTimer.snapshot();
    if (id === undefined) return;
    let frame = 0;
    if (document.visibilityState === "hidden") {
      navigationTimer.discard();
      return;
    }
    const hidden = () => {
      if (document.visibilityState === "hidden") {
        cancelAnimationFrame(frame);
        navigationTimer.discard();
      }
    };
    document.addEventListener("visibilitychange", hidden);
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => { navigationTimer.finish(id, routeLabel(location.pathname)); });
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [location.key, location.pathname, navigation.state, revalidator.state]);
  return null;
}
