import type { ClientInstrumentation } from "react-router";
import { recordMeasurement } from "./index";
import { duration, Metric, NavigationKind, Outcome, routeLabel } from "./metrics";
import { createNavigationTimer } from "./navigation";

export const navigationTimer = createNavigationTimer(() => performance.now(), recordMeasurement);

/** React Router's observational hooks preserve route results and errors. */
export const performanceInstrumentation: ClientInstrumentation = {
  router(router) {
    router.instrument({
      async navigate(callNavigate) {
        navigationTimer.begin(NavigationKind.Navigation);
        await callNavigate();
      },
    });
  },
  route(route) {
    route.instrument({
      async loader(callLoader, { request }) {
        const started = performance.now();
        const result = await callLoader();
        recordMeasurement({ metric: Metric.Loader, duration_ms: duration(started, performance.now()), outcome: result.status === "success" ? Outcome.Success : Outcome.Error, route: routeLabel(new URL(request.url).pathname), route_id: route.id });
      },
      async action(callAction, { request }) {
        const started = performance.now();
        const result = await callAction();
        recordMeasurement({ metric: Metric.Action, duration_ms: duration(started, performance.now()), outcome: result.status === "success" ? Outcome.Success : Outcome.Error, route: routeLabel(new URL(request.url).pathname), route_id: route.id });
      },
    });
  },
};
