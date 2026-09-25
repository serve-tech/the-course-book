import { createApp } from "../app";
import { createDatabase } from "../db/client";
import { documentConfig } from "./document";

/**
 * The OpenAPI document exactly as the running API publishes it.
 *
 * Builds the app with inert dependencies: the pool is never queried (pg
 * connects lazily) and no request is served, so no environment or database
 * is needed.
 */
export function contractDocument() {
  const app = createApp({
    db: createDatabase("postgres://contract@127.0.0.1:1/contract").db,
    verifySession: () => Promise.resolve(null),
    provisioner: {
      resolve: () => Promise.reject(new Error("unused while emitting the contract")),
      forget: () => undefined,
    },
    search: { search: () => Promise.resolve([]) },
    webOrigins: [],
    clientConfig: {
      minimumVersions: { ios: "0.0.0", android: "0.0.0" },
      privacyUrl: "https://coursebook.golf/privacy",
      accountDeletionUrl: "https://coursebook.golf/account",
    },
  });
  return app.getOpenAPIDocument(documentConfig);
}
