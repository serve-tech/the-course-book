import { createClerkClient } from "@clerk/backend";
import type { SignedInAuthObject, SignedOutAuthObject } from "@clerk/backend/internal";
import { isAuthorizedParty } from "./azp";

/** A verified Clerk session: the Clerk user id and the token's claims. */
export interface VerifiedSession {
  clerkId: string;
  claims: Record<string, unknown>;
}

/** Reasons the API adds to Clerk's own when it rejects a token. */
export enum SessionRejection {
  /** The Authorization header is not `Bearer <token>`; Clerk is not called. */
  NotBearer = "not-bearer",
  /** Clerk verified the token, but its session is pending or names no user. */
  NoActiveSession = "no-active-session",
  /** The token's `azp` is not one of the web origins (`isAuthorizedParty`). */
  UnauthorizedParty = "unauthorized-party",
}

/**
 * The outcome of verifying a request's token.
 *
 * A rejection carries its reason and, only when the `azp` claim was the
 * reason, that claim. The reason is a `SessionRejection` or Clerk's reason
 * (`token-invalid-signature`, `jwk-kid-mismatch`, …). Clerk declares its
 * reasons as literal unions but composes values outside them, e.g.
 * `session-token-expired-refresh-non-eligible-no-refresh-cookie` for an
 * expired token, so `reason` is typed as the string it really is. A
 * rejection never carries the token, other claims or Clerk's message, which
 * can quote claim values.
 */
export type SessionVerification =
  | { ok: true; session: VerifiedSession }
  | { ok: false; reason: string; azp?: unknown };

/** Verifies the bearer token on a request. */
export type SessionVerifier = (request: Request) => Promise<SessionVerification>;

export interface ClerkVerifierOptions {
  secretKey: string;
  publishableKey: string;
  /**
   * The instance's JWT public key (PEM). With it tokens verify locally, with
   * no JWKS fetch after a cold start. Without it Clerk fetches the JWKS.
   */
  jwtKey?: string | undefined;
  /** Exact web origins accepted in a token's `azp` claim. */
  webOrigins: readonly string[];
}

/**
 * Verify Clerk session tokens sent as `Authorization: Bearer <token>`.
 *
 * Uses `authenticateRequest` rather than bare `verifyToken` so pending
 * sessions count as signed out. `authorizedParties` is deliberately not
 * passed; `isAuthorizedParty` applies the API's own policy afterwards so
 * native tokens without `azp` are accepted.
 *
 * Note:
 *     Call it only for an `Authorization: Bearer <token>` header
 *     (`isBearerHeader`). Otherwise Clerk takes a bare value as a token and
 *     follows its cookie flow for anything else, which a bearer-only API
 *     never wants.
 */
export function createClerkSessionVerifier(options: ClerkVerifierOptions): SessionVerifier {
  const clerk = createClerkClient({
    secretKey: options.secretKey,
    publishableKey: options.publishableKey,
    ...(options.jwtKey ? { jwtKey: options.jwtKey } : {}),
  });
  return async (request) => {
    const state = await clerk.authenticateRequest(request, {
      acceptsToken: "session_token",
      ...(options.jwtKey ? { jwtKey: options.jwtKey } : {}),
    });
    if (!state.isAuthenticated) return { ok: false, reason: state.reason };
    // Typed as signed in, but a pending session (sts: "pending") yields a
    // signed-out object because treatPendingAsSignedOut defaults to true.
    const auth: SignedInAuthObject | SignedOutAuthObject = state.toAuth();
    if (!auth.userId) return { ok: false, reason: SessionRejection.NoActiveSession };
    const azp = auth.sessionClaims["azp"];
    if (!isAuthorizedParty(azp, options.webOrigins)) return { ok: false, reason: SessionRejection.UnauthorizedParty, azp };
    return { ok: true, session: { clerkId: auth.userId, claims: auth.sessionClaims } };
  };
}
