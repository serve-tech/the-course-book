import { duration, Metric, NavigationKind, Outcome, type Measurement } from "./metrics";

/** One pending UI transition. Superseded transitions never become successful samples. */
export function createNavigationTimer(now: () => number, emit: (measurement: Measurement) => void) {
  let sequence = 0;
  let pending: { id: number; started: number; kind: NavigationKind } | null = {
    id: sequence, started: 0, kind: NavigationKind.Initial,
  };
  return {
    begin(kind: NavigationKind) {
      pending = { id: ++sequence, started: now(), kind };
    },
    beginRevalidation() {
      if (!pending) pending = { id: ++sequence, started: now(), kind: NavigationKind.Revalidation };
    },
    snapshot: () => pending?.id,
    finish(id: number, route: string) {
      if (pending?.id !== id) return;
      const { started, kind } = pending;
      pending = null;
      emit({ metric: Metric.Navigation, duration_ms: duration(started, now()), outcome: Outcome.Ready, navigation_kind: kind, route });
    },
    discard() { pending = null; },
  };
}
