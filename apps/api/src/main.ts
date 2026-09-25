import { createClerkClient } from "@clerk/backend";
import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { createClerkSessionVerifier } from "./auth/session";
import { createDatabase } from "./db/client";
import { runMigrations } from "./db/migrate";
import { allCourses, catalog } from "./services/catalog";
import { apiEnv, clerkEnv, databaseEnv, searchEnv } from "./services/env";
import { createProvisioner, identityFromClerkUser, provisionUser } from "./services/provisioning";
import { createCourseSearch } from "./services/search";

/**
 * API process entry: validate the environment, migrate, serve.
 *
 * Migrations run here because free Render plans have no pre-deploy step;
 * they hold an advisory lock, so overlapping deploys are safe. Missing or
 * malformed settings stop the process before it listens, which fails the
 * deploy instead of serving errors. SIGTERM (Render's stop signal) closes the
 * server, then idle keep-alive sockets, then the database pool.
 */

const database = databaseEnv();
const clerk = clerkEnv();
const search = searchEnv();
const api = apiEnv();

await runMigrations(database.DATABASE_URL);

const { db, pool } = createDatabase(database.DATABASE_URL);
// An idle client can lose its connection (database restart, network blip);
// pg reports that on the pool, and an unhandled 'error' event would crash.
pool.on("error", (error) => {
  console.error("Idle database connection failed", error);
});

const clerkClient = createClerkClient({ secretKey: clerk.CLERK_SECRET_KEY });
const app = createApp({
  db,
  verifySession: createClerkSessionVerifier({
    secretKey: clerk.CLERK_SECRET_KEY,
    publishableKey: clerk.CLERK_PUBLISHABLE_KEY,
    jwtKey: api.CLERK_JWT_KEY,
    webOrigins: api.WEB_ORIGINS,
  }),
  provisioner: createProvisioner({
    provision: (clerkId, identity) => provisionUser(db, clerkId, identity),
    fetchIdentity: async (clerkId) => identityFromClerkUser(await clerkClient.users.getUser(clerkId)),
  }),
  search: createCourseSearch({
    catalog: () => allCourses(db),
    apiUrl: search.OPENGOLF_API_URL,
    csvUrl: search.OPENGOLF_CSV_URL,
  }),
  webOrigins: api.WEB_ORIGINS,
  clientConfig: {
    minimumVersions: { ios: api.MIN_IOS_VERSION, android: api.MIN_ANDROID_VERSION },
    privacyUrl: api.PUBLIC_WEB_URL + "/privacy",
    accountDeletionUrl: api.PUBLIC_WEB_URL + "/account",
  },
});

const server = serve({ fetch: app.fetch, port: api.PORT }, (info) => {
  console.log(JSON.stringify({ event: "listening", port: info.port }));
  // Load the catalog now so the first member after a cold start does not wait for it.
  catalog(db).catch((error: unknown) => {
    console.error("Catalog warm-up failed", error);
  });
});

function shutdown(signal: string): void {
  console.log(JSON.stringify({ event: "shutdown", signal }));
  server.close(() => {
    pool.end().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error("Closing the database pool failed", error);
        process.exit(1);
      },
    );
  });
  if ("closeIdleConnections" in server) server.closeIdleConnections();
}

process.on("SIGTERM", () => {
  shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  shutdown("SIGINT");
});
