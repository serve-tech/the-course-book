import type { RouteConfig } from "@hono/zod-openapi";
import { memberOnly } from "../auth/middleware";

/**
 * A route as registered: operations the contract marks as secured get
 * `memberOnly` ahead of input validation. Register every route through this
 * so the contract's `security` is also the enforcement.
 */
export function guarded<R extends RouteConfig>(route: R): R {
  return route.security?.length ? { ...route, middleware: [memberOnly] } : route;
}
