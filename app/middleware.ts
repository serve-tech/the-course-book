import { clerkMiddleware } from "@clerk/react-router/server";
import type { MiddlewareFunction } from "react-router";
import { appUserMiddleware } from "./server/auth.server";
import { clerkEnv } from "@coursebook/api/services/env";

/**
 * Request middleware for every route: Clerk verifies the session, then the
 * app user is provisioned into the router context. Exported by root.tsx.
 */
const { CLERK_PUBLISHABLE_KEY: publishableKey, CLERK_SECRET_KEY: secretKey } =
  clerkEnv();

export const middleware: MiddlewareFunction<Response>[] = [
  clerkMiddleware({ publishableKey, secretKey }),
  appUserMiddleware,
];
