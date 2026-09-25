import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { getClientConfig } from "../contract/routes";
import type { AppEnv } from "../http/env";

/** Settings clients read at launch. */
export function registerClientRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(getClientConfig, (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json(deps.clientConfig, 200);
  });
}
