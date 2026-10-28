import type { Context, MiddlewareHandler } from "hono";
import type { AppEnv } from "../http/env";
import { AppError, ErrorCode } from "../services/errors";
import type { AppUser, Provisioner } from "../services/provisioning";
import { SessionRejection, type SessionVerification, type SessionVerifier } from "./session";

/** Receives one warning per rejected token: the request id, the reason and, for an `azp` rejection, the `azp`. */
export type RejectionLog = (message: string, detail: Record<string, unknown>) => void;

/**
 * Whether an Authorization header is `Bearer <token>`, the only form the API accepts.
 *
 * Clerk's `authenticateRequest` reads a token from exactly this form (the
 * scheme spelled `Bearer`, one space). It also takes a lone value with no
 * scheme as a token, and for any other scheme it ignores the header and
 * follows its cookie flow, which a bearer-only API never wants. So anything
 * else is rejected before Clerk sees it.
 *
 * Args:
 *     header: The Authorization header's value.
 *
 * Returns:
 *     True for `Bearer ` followed by one token without whitespace.
 */
export function isBearerHeader(header: string): boolean {
  return /^Bearer \S+$/.test(header);
}

/**
 * Resolve the request's session from `Authorization: Bearer <token>`.
 *
 * No header means anonymous, without calling Clerk. A header that is not a
 * bearer token, or whose token does not verify, is a 401, never a silent
 * downgrade to anonymous: a client whose token expired must learn it rather
 * than see empty personal data.
 *
 * Args:
 *     verify: Checks the token (Clerk in production and tests).
 *     warn: Logs each rejection with its reason, so a wrong
 *         `CLERK_JWT_KEY` or a missing web origin shows up in the logs
 *         rather than only as 401s. It never receives the token.
 */
export function sessionMiddleware(verify: SessionVerifier, warn: RejectionLog): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization");
    if (!header) {
      c.set("session", null);
      return next();
    }
    const result: SessionVerification = isBearerHeader(header)
      ? await verify(c.req.raw)
      : { ok: false, reason: SessionRejection.NotBearer };
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
 *     AppError: 401 `unauthenticated` for anonymous requests; 401
 *         `account_deleted` after the account was deleted; 403
 *         `username_invalid` when the Clerk username breaks the product
 *         rule; 409 `username_taken` when another member holds the username.
 */
export async function requireUser(c: Context<AppEnv>, provisioner: Provisioner): Promise<AppUser> {
  const session = c.get("session");
  if (!session) throw new AppError(401, ErrorCode.Unauthenticated, "Sign in to continue.");
  return provisioner.resolve(session.clerkId, session.claims);
}
