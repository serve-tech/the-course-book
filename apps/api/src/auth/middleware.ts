import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../http/env";
import { AppError, ErrorCode } from "../services/errors";
import type { AppUser, Provisioner } from "../services/provisioning";
import type { SessionVerifier } from "./session";

/** Receives one warning per rejected token: the request id, the reason and, for an `azp` rejection, the `azp`. */
export type RejectionLog = (message: string, detail: Record<string, unknown>) => void;

/**
 * Resolve the request's session from `Authorization: Bearer <token>`.
 *
 * No header means anonymous, without calling Clerk. A header that does not
 * verify is a 401, never a silent downgrade to anonymous: a client whose
 * token expired must learn it rather than see empty personal data.
 *
 * Args:
 *     verify: Checks the token (Clerk in production and tests).
 *     warn: Logs each rejection with its reason, so a wrong
 *         `CLERK_JWT_KEY` or a missing web origin shows up in the logs
 *         rather than only as 401s. It never receives the token.
 */
export function sessionMiddleware(verify: SessionVerifier, warn: RejectionLog): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (!c.req.header("authorization")) {
      c.set("session", null);
      return next();
    }
    const result = await verify(c.req.raw);
    if (!result.ok) {
      const azp = "azp" in result ? { azp: result.azp } : {};
      warn("Session token rejected", { requestId: c.get("requestId"), reason: result.reason, ...azp });
      throw new AppError(401, ErrorCode.Unauthenticated, "Your session has expired. Sign in again.");
    }
    c.set("session", result.session);
    await next();
  };
}

/**
 * Reject anonymous requests before the route validates its input, so a
 * secured operation answers 401 rather than 400 to a client without a
 * session. Attached to every secured operation by `guarded`.
 */
export const memberOnly: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get("session")) throw new AppError(401, ErrorCode.Unauthenticated, "Sign in to continue.");
  await next();
};

/**
 * The signed-in member for a secured operation, provisioned on first use.
 *
 * Raises:
 *     AppError: 401 `unauthenticated` for anonymous requests; 403
 *         `username_invalid` when the Clerk username breaks the product rule.
 */
export async function requireUser(c: Context<AppEnv>, provisioner: Provisioner): Promise<AppUser> {
  const session = c.get("session");
  if (!session) throw new AppError(401, ErrorCode.Unauthenticated, "Sign in to continue.");
  return provisioner.resolve(session.clerkId, session.claims);
}
