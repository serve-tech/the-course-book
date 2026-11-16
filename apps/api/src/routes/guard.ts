import type { RouteConfig } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { memberOnly } from "../auth/middleware";
import type { AppEnv } from "../http/env";

/**
 * A route as registered: operations the contract marks as secured get
 * `memberOnly` ahead of input validation. Register every route through this
 * so the contract's `security` is also the enforcement.
 *
 * @param route - The operation from `contract/routes.ts`.
 * @param before - Checks that run after `memberOnly` and before the body is
 *   read and validated, e.g. refusing an upload before receiving the file.
 */
export function guarded<R extends RouteConfig>(route: R, ...before: MiddlewareHandler<AppEnv>[]): R {
  const middleware = [...(route.security?.length ? [memberOnly] : []), ...before];
  return middleware.length ? { ...route, middleware } : route;
}
