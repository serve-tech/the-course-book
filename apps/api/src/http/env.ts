import type { RequestIdVariables } from "hono/request-id";
import type { VerifiedSession } from "../auth/session";

/**
 * Per-request context of the API: the request id (set by `hono/request-id`)
 * and the verified session, null for anonymous requests.
 */
export interface AppEnv {
  Variables: RequestIdVariables & {
    session: VerifiedSession | null;
  };
}
