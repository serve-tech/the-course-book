import { createClerkClient } from "@clerk/backend";
import type { SignedInAuthObject, SignedOutAuthObject } from "@clerk/backend/internal";
import { isAuthorizedParty } from "./azp";

/** A verified Clerk session: the Clerk user id and the token's claims. */
export interface VerifiedSession {
  clerkId: string;
  claims: Record<string, unknown>;
}

/** Verifies the bearer token on a request; null when it is not acceptable. */
export type SessionVerifier = (request: Request) => Promise<VerifiedSession | null>;

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
 *     Call it only when an Authorization header is present. Without one,
 *     Clerk follows its cookie flow, which a bearer-only API never wants.
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
    if (!state.isAuthenticated) return null;
    // Typed as signed in, but a pending session (sts: "pending") yields a
    // signed-out object because treatPendingAsSignedOut defaults to true.
    const auth: SignedInAuthObject | SignedOutAuthObject = state.toAuth();
    if (!auth.userId) return null;
    if (!isAuthorizedParty(auth.sessionClaims["azp"], options.webOrigins)) return null;
    return { clerkId: auth.userId, claims: auth.sessionClaims };
  };
}
