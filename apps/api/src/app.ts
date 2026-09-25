import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import type { AccountDirectory } from "./auth/accounts";
import { sessionMiddleware } from "./auth/middleware";
import type { SessionVerifier } from "./auth/session";
import { documentConfig, SECURITY_SCHEME } from "./contract/document";
import type { ClientConfig } from "./contract/schemas";
import type { Database } from "./db/client";
import type { AppEnv } from "./http/env";
import { errorHandler, notFoundHandler, validationHook } from "./http/errors";
import { registerAccountRoutes } from "./routes/account";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerClientRoutes } from "./routes/clients";
import { registerJournalRoutes } from "./routes/journal";
import { registerMemberRoutes } from "./routes/members";
import { checkDatabase } from "./services/health";
import type { Provisioner } from "./services/provisioning";
import type { CourseSearch } from "./services/search";

/** One line per request, for Render's log stream. */
export interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  status: number;
  ms: number;
}

export interface Logger {
  request(entry: RequestLog): void;
  error(message: string, detail: unknown): void;
}

/** Everything the API needs from the outside; tests pass fakes for Clerk and search. */
export interface AppDependencies {
  db: Database;
  verifySession: SessionVerifier;
  provisioner: Provisioner;
  /** Clerk's side of account deletion. */
  accounts: AccountDirectory;
  search: CourseSearch;
  /** Exact origins of the web app, used for CORS and the token `azp` check. */
  webOrigins: readonly string[];
  clientConfig: ClientConfig;
  logger?: Logger;
}

const consoleLogger: Logger = {
  request: (entry) => {
    console.log(JSON.stringify(entry));
  },
  error: (message, detail) => {
    console.error(message, detail);
  },
};

/** Personal responses must never be stored by a shared cache. */
const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store");
};

/**
 * Build the API application.
 *
 * Middleware order matters: request id and logging wrap everything; CORS
 * answers preflights before authentication; the body limit and session
 * checks apply to `/v1` only. `/healthz` stays outside `/v1`, unlogged, for
 * Render's frequent probes.
 */
export function createApp(deps: AppDependencies): OpenAPIHono<AppEnv> {
  const logger = deps.logger ?? consoleLogger;
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

  app.use("*", requestId());
  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    if (c.req.path === "/healthz") return;
    logger.request({
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });
  app.use(
    "*",
    cors({
      origin: (origin) => (deps.webOrigins.includes(origin) ? origin : null),
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Authorization", "Content-Type"],
      exposeHeaders: ["ETag", "X-Request-Id"],
      maxAge: 7200,
    }),
  );
  app.use("*", compress());
  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: 32 * 1024,
      onError: () => {
        throw new HTTPException(413);
      },
    }),
  );
  app.use("/v1/*", sessionMiddleware(deps.verifySession));
  for (const path of ["/v1/me", "/v1/me/*", "/v1/members", "/v1/members/*", "/v1/course-search"])
    app.use(path, noStore);

  app.get("/healthz", async (c) => {
    try {
      await checkDatabase(deps.db);
      return c.json({ ok: true });
    } catch (error) {
      logger.error("Health check failed", error);
      return c.json({ ok: false }, 503);
    }
  });

  registerAccountRoutes(app, deps);
  registerJournalRoutes(app, deps);
  registerCatalogRoutes(app, deps);
  registerMemberRoutes(app, deps);
  registerClientRoutes(app, deps);

  app.openAPIRegistry.registerComponent("securitySchemes", SECURITY_SCHEME, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "A Clerk session token from the web, iOS or Android SDK.",
  });
  app.doc("/v1/openapi.json", documentConfig);

  app.notFound(notFoundHandler);
  app.onError(
    errorHandler((message, detail) => {
      logger.error(message, detail);
    }),
  );
  return app;
}
