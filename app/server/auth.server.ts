import { createClerkClient, getAuth } from "@clerk/react-router/server";
import {
  createContext,
  data,
  type MiddlewareFunction,
  type RouterContextProvider,
} from "react-router";
import { db } from "./db.server";
import { clerkEnv } from "./env.server";
import { AppError } from "./errors.server";
import {
  createProvisioner,
  identityFromClerkUser,
  provisionUser,
  type AppUser,
} from "./provisioning.server";

/**
 * React Router glue for application identity.
 *
 * On each signed-in request the middleware resolves the Clerk user to an
 * app user through the framework-free provisioner and stores it in the
 * router context. Loaders and actions read it with `getAppUser` or
 * `requireUser`; they never accept a user id from the client.
 */

export type { AppUser } from "./provisioning.server";

export const userContext = createContext<AppUser | null>(null);

const provisioner = createProvisioner({
  provision: (clerkId, identity) => provisionUser(db, clerkId, identity),
  fetchIdentity: async (clerkId) => {
    const client = createClerkClient({ secretKey: clerkEnv().CLERK_SECRET_KEY });
    return identityFromClerkUser(await client.users.getUser(clerkId));
  },
});

/**
 * Resolve the app user for the request and put it in the router context.
 * A provisioning `AppError` (403 for an invalid username) becomes a data
 * response with the same status.
 */
export const appUserMiddleware: MiddlewareFunction<Response> = async (
  args,
  next,
) => {
  const auth = await getAuth(args);
  if (auth.userId) {
    try {
      args.context.set(
        userContext,
        await provisioner.resolve(auth.userId, auth.sessionClaims),
      );
    } catch (error) {
      if (error instanceof AppError)
        throw data({ error: error.message }, { status: error.status });
      throw error;
    }
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
