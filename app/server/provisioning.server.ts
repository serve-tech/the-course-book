import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { USERNAME_RULE, isValidUsername } from "../features/auth/username";
import { AppError, ErrorCode } from "./errors.server";

/**
 * Application users on top of Clerk, independent of any web framework.
 *
 * Clerk owns credentials and sessions. Each authenticated request resolves
 * the Clerk user to a `users` row: identity comes from the session token
 * claims when the Clerk session template provides them (`username`, `email`,
 * `name` as the full name, `image_url`), otherwise from the Clerk Backend
 * API. A short per-user cache skips the upsert for repeat requests.
 */

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
}

/** Identity fields provisioning needs, however they were obtained. */
export interface Identity {
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
}

/** The Clerk user fields `identityFromClerkUser` reads. */
export interface ClerkUserFields {
  username: string | null;
  fullName: string | null;
  primaryEmailAddress: { emailAddress: string } | null;
  imageUrl: string;
}

const claimsSchema = z
  .object({
    username: z.string().min(1).optional(),
    email: z.email().optional(),
    name: z.string().optional(),
    image_url: z.url().optional(),
  })
  .partial();

/** Read identity from session claims; undefined when the username claim is absent. */
export function identityFromClaims(claims: unknown): Identity | undefined {
  const parsed = claimsSchema.safeParse(claims);
  if (!parsed.success || !parsed.data.username) return undefined;
  const { username, email, name, image_url } = parsed.data;
  return {
    username,
    displayName: name?.trim() || username,
    email: email ?? null,
    avatarUrl: image_url ?? null,
  };
}

/** Identity from a Clerk Backend API user, matching the session claims' meaning. */
export function identityFromClerkUser(user: ClerkUserFields): Identity {
  const username = user.username ?? "";
  return {
    username,
    displayName: user.fullName ?? username,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    avatarUrl: user.imageUrl || null,
  };
}

/**
 * Insert or refresh the `users` row for a Clerk user.
 *
 * Args:
 *     database: Handle to use (the request database or a test database).
 *     clerkId: Clerk user id; becomes `users.id`.
 *     identity: Username, display name, email and avatar from Clerk.
 *
 * Returns:
 *     The application user.
 *
 * Raises:
 *     AppError: 403 `username_invalid` when the username violates the
 *         product rule, so a misconfigured Clerk instance cannot create
 *         unusable accounts.
 */
export async function provisionUser(
  database: Database,
  clerkId: string,
  identity: Identity,
): Promise<AppUser> {
  if (!isValidUsername(identity.username))
    throw new AppError(403, ErrorCode.UsernameInvalid, USERNAME_RULE);
  const displayName = identity.displayName.trim() || identity.username;
  const [row] = await database
    .insert(users)
    .values({
      id: clerkId,
      username: identity.username,
      displayName,
      email: identity.email,
      avatarUrl: identity.avatarUrl,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        username: identity.username,
        displayName,
        email: identity.email,
        avatarUrl: identity.avatarUrl,
        updatedAt: sql`now()`,
        deletedAt: null,
      },
    })
    .returning({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
    });
  if (!row) throw new Error("User provisioning returned no row");
  return row;
}

/** Resolves authenticated Clerk users to app users, caching per user. */
export interface Provisioner {
  /**
   * The app user for a verified Clerk user.
   *
   * Args:
   *     clerkId: Verified Clerk user id (the token subject).
   *     claims: Session token claims; identity is read from them when present.
   */
  resolve(clerkId: string, claims: unknown): Promise<AppUser>;
  /** Drop the cached user so the next request provisions again. */
  forget(clerkId: string): void;
}

export interface ProvisionerOptions {
  /** Upsert the user row; production passes `provisionUser` bound to the database. */
  provision: (clerkId: string, identity: Identity) => Promise<AppUser>;
  /** Fetch identity when the claims lack it (Clerk Backend API in production). */
  fetchIdentity: (clerkId: string) => Promise<Identity>;
  /** How long a provisioned user is reused. Defaults to 60 seconds. */
  ttlMs?: number;
  /** Clock, injectable for tests. Defaults to `Date.now`. */
  now?: () => number;
}

const identityKey = (identity: Identity) =>
  [identity.username, identity.displayName, identity.email ?? "", identity.avatarUrl ?? ""].join("|");

/**
 * Create a provisioner with a cache keyed by Clerk user id.
 *
 * A cached user is reused until it expires or the claims carry a different
 * identity. Without identity claims, the cached user is reused for the TTL
 * instead of calling the Backend API on every request. Expired entries are
 * pruned on each write, so the cache holds at most the recently active users.
 */
export function createProvisioner(options: ProvisionerOptions): Provisioner {
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { until: number; key: string; user: AppUser }>();

  const prune = (at: number) => {
    for (const [id, entry] of cache) if (entry.until <= at) cache.delete(id);
  };

  return {
    async resolve(clerkId, claims) {
      const claimed = identityFromClaims(claims);
      const cached = cache.get(clerkId);
      if (cached && cached.until > now() && (!claimed || identityKey(claimed) === cached.key))
        return cached.user;
      const identity = claimed ?? (await options.fetchIdentity(clerkId));
      const user = await options.provision(clerkId, identity);
      const at = now();
      prune(at);
      cache.set(clerkId, { until: at + ttlMs, key: identityKey(identity), user });
      return user;
    },
    forget(clerkId) {
      cache.delete(clerkId);
    },
  };
}
