import { createClerkClient, getAuth } from "@clerk/react-router/server";
import { sql } from "drizzle-orm";
import {
  createContext,
  data,
  type MiddlewareFunction,
  type RouterContextProvider,
} from "react-router";
import { z } from "zod";
import type { Database } from "../db/client";
import { users } from "../db/schema";
import { USERNAME_RULE, isValidUsername } from "../features/auth/username";
import { db } from "./db.server";
import { clerkEnv } from "./env.server";

/**
 * Application identity on top of Clerk.
 *
 * Clerk owns credentials and sessions. On each signed-in request the
 * middleware provisions (upserts) the matching `users` row from the session
 * claims and stores an `AppUser` in the router context. Loaders and actions
 * read it with `getAppUser` or `requireUser`; they never accept a user id
 * from the client.
 *
 * Session token claims: configure the Clerk session token template with
 * `username`, `email`, `name` and `image_url` so provisioning needs no
 * Backend API call. When a claim is missing (default template), the user is
 * fetched once from the Backend API.
 */

export interface AppUser {
  id: string;
  username: string;
  displayName: string;
}

export const userContext = createContext<AppUser | null>(null);

/** Identity fields provisioning needs, however they were obtained. */
export interface Identity {
  username: string;
  displayName: string;
  email: string | null;
  avatarUrl: string | null;
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

async function identityFromBackend(userId: string): Promise<Identity> {
  const client = createClerkClient({ secretKey: clerkEnv().CLERK_SECRET_KEY });
  const user = await client.users.getUser(userId);
  const username = user.username ?? "";
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return {
    username,
    displayName: name || username,
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
 *     Response (403) when the username violates the product rule, so a
 *     misconfigured Clerk instance cannot create unusable accounts.
 */
export async function provisionUser(
  database: Database,
  clerkId: string,
  identity: Identity,
): Promise<AppUser> {
  if (!isValidUsername(identity.username))
    throw data({ error: USERNAME_RULE }, { status: 403 });
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

const PROVISION_TTL_MS = 60_000;
const recentlyProvisioned = new Map<string, { until: number; user: AppUser }>();

/**
 * Resolve the app user for the request and put it in the router context.
 * Skips the database write when the same identity was provisioned within
 * the last minute.
 */
export const appUserMiddleware: MiddlewareFunction<Response> = async (
  args,
  next,
) => {
  const auth = await getAuth(args);
  if (auth.userId) {
    const identity =
      identityFromClaims(auth.sessionClaims) ??
      (await identityFromBackend(auth.userId));
    const key = `${auth.userId}|${identity.username}|${identity.displayName}|${identity.email ?? ""}|${identity.avatarUrl ?? ""}`;
    const cached = recentlyProvisioned.get(key);
    const user =
      cached && cached.until > Date.now()
        ? cached.user
        : await provisionUser(db, auth.userId, identity);
    recentlyProvisioned.set(key, { until: Date.now() + PROVISION_TTL_MS, user });
    args.context.set(userContext, user);
  }
  return next();
};

/** The signed-in app user, or null for anonymous requests. */
export function getAppUser(
  context: Readonly<RouterContextProvider>,
): AppUser | null {
  return context.get(userContext);
}

/** The signed-in app user; throws a 401 data response for anonymous requests. */
export function requireUser(context: Readonly<RouterContextProvider>): AppUser {
  const user = context.get(userContext);
  if (!user) throw data({ error: "Sign in to continue." }, { status: 401 });
  return user;
}
