import { getToken } from "@clerk/react-router";
import { createApiClient } from "./client";
import { serverStatus } from "./server-status";

/**
 * The web app's API client. Calls carry the Clerk session token (waiting for
 * Clerk to load when necessary); only call it from the browser, i.e. in
 * clientLoader, clientAction, effects and event handlers.
 */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL,
  getToken: () => getToken(),
  onSlow: (slow) => {
    serverStatus.set(slow);
  },
});

export { ApiError, expectOk, unwrap } from "./client";
export type { ApiSchemas } from "./client";
