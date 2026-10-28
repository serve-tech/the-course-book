import type { VerifiedSession } from "../auth/session";

/**
 * Per-request context of the API: the request id (set by `serverRequestId`
 * in app.ts, never taken from the client) and the verified session, null
 * for anonymous requests.
 */
export interface AppEnv {
  Variables: {
    requestId: string;
    session: VerifiedSession | null;
  };
}
