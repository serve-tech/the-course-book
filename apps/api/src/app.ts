import { OpenAPIHono } from "@hono/zod-openapi";
import type { MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { randomUUID } from "node:crypto";
import type { AccountDirectory } from "./auth/accounts";
import { sessionMiddleware } from "./auth/middleware";
import type { SessionVerifier } from "./auth/session";
import { documentConfig, SECURITY_SCHEME } from "./contract/document";
import type { ClientConfig } from "./contract/schemas";
import type { Database } from "./db/client";
import type { AppEnv } from "./http/env";
import { errorHandler, notFoundHandler, validationHook } from "./http/errors";
import { loggableError, type LoggedError } from "./http/loggable-error";
import { registerAccountRoutes } from "./routes/account";
import { registerCatalogRoutes } from "./routes/catalog";
import { registerClientRoutes } from "./routes/clients";
import { registerFeedRoutes } from "./routes/feed";
import { registerJournalRoutes } from "./routes/journal";
import { registerMemberRoutes } from "./routes/members";
import { registerTopListRoutes } from "./routes/top-lists";
import { registerWantToPlayRoutes } from "./routes/want-to-play";
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

/**
 * Where the API writes its logs.
 *
 * `warn` reports expected but noteworthy events, such as a rejected session
 * token, with plain fields. `error` takes a `LoggedError`, never the thrown
 * value, so a query's parameters or a Postgres error's row values cannot
 * reach the log (`loggableError`). `detail` carries fields such as the
 * request id, so every kind of line can be found by `requestId`.
 */
export interface Logger {
  request(entry: RequestLog): void;
  warn(message: string, detail: Record<string, unknown>): void;
  error(message: string, error: LoggedError, detail?: Record<string, unknown>): void;
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

/**
 * One JSON line per entry, for Render's log stream. `level` and `message`
 * come last, so a detail field cannot replace them.
 */
export const consoleLogger: Logger = {
  request: (entry) => {
    console.log(JSON.stringify(entry));
  },
  warn: (message, detail) => {
    console.warn(JSON.stringify({ ...detail, level: "warn", message }));
  },
  error: (message, error, detail = {}) => {
    console.error(JSON.stringify({ ...detail, level: "error", message, error }));
  },
};

/**
 * Give every request an id generated here, sent back as `X-Request-Id`.
 *
 * Hono's `requestId()` adopts a client's `X-Request-Id` when it looks valid,
 * which lets a client pick the id its request is logged under, for example
 * one copied from another member's error report. The client's header is
 * ignored.
 */
const serverRequestId: MiddlewareHandler<AppEnv> = async (c, next) => {
  const id = randomUUID();
  c.set("requestId", id);
  c.header("X-Request-Id", id);
  await next();
};

/**
 * Security headers for a JSON API (OWASP REST Security Cheat Sheet): nothing
 * in a response may load, run or be framed, and browsers must not sniff
 * types or downgrade to HTTP. Hono's other defaults (Referrer-Policy
 * no-referrer, no X-Powered-By, …) stay.
 *
 * `Cross-Origin-Resource-Policy` is `cross-origin` rather than Hono's
 * `same-origin`: the web app reads the API from another origin, and CORS
 * decides who may read a response. CORP only governs no-cors loads (images,
 * scripts), which carry no bearer token and so can only reach public data.
 */
const securityHeaders = secureHeaders({
  contentSecurityPolicy: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
  xFrameOptions: "DENY",
  crossOriginResourcePolicy: "cross-origin",
});

/** Personal responses must never be stored by a shared cache. */
const noStore: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.header("Cache-Control", "private, no-store");
};

/**
 * Build the API application.
 *
 * Middleware order matters: request id, logging and security headers wrap
 * everything; CORS answers preflights before authentication; the body limit
 * and session checks apply to `/v1` only. `/healthz` stays outside `/v1`,
 * unlogged, for Render's frequent probes.
 */
export function createApp(deps: AppDependencies): OpenAPIHono<AppEnv> {
  const logger = deps.logger ?? consoleLogger;
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook });

  app.use("*", serverRequestId);
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
  app.use("*", securityHeaders);
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
  app.use(
    "/v1/*",
    sessionMiddleware(deps.verifySession, (message, detail) => {
      logger.warn(message, detail);
    }),
  );
  for (const path of ["/v1/me", "/v1/me/*", "/v1/members", "/v1/members/*", "/v1/member-search", "/v1/course-search", "/v1/feed", "/v1/top-lists", "/v1/top-lists/*"])
    app.use(path, noStore);

  app.get("/healthz", async (c) => {
    try {
      await checkDatabase(deps.db);
      return c.json({ ok: true });
    } catch (error) {
      logger.error("Health check failed", loggableError(error), { requestId: c.get("requestId") });
      return c.json({ ok: false }, 503);
    }
  });

  registerAccountRoutes(app, deps);
  registerJournalRoutes(app, deps);
  registerCatalogRoutes(app, deps);
  registerMemberRoutes(app, deps);
  registerWantToPlayRoutes(app, deps);
  registerTopListRoutes(app, deps);
  registerFeedRoutes(app, deps);
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
    errorHandler((message, error, detail) => {
      logger.error(message, error, detail);
    }),
  );
  return app;
}
