import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toMyCourse, toRound } from "../contract/mappers";
import { deleteMe, getMe, listMyCourseRounds, listMyCourses } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { deleteAccountData } from "../services/accounts";
import { AppError, ErrorCode } from "../services/errors";
import { personalList, roundHistory } from "../services/journal";

/** The signed-in member and their own list. */
export function registerAccountRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(getMe), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    return c.json({ username: user.username, displayName: user.displayName }, 200);
  });

  /*
   * Database first, then Clerk. If Clerk were first and the database step
   * failed, the data would remain with no account left to retry from. A
   * retry after a Clerk failure finds the tombstone (`account_deleted`) and
   * goes straight to Clerk.
   */
  app.openapi(guarded(deleteMe), async (c) => {
    const session = c.get("session");
    if (!session) throw new AppError(401, ErrorCode.Unauthenticated, "Sign in to continue.");
    try {
      const user = await requireUser(c, deps.provisioner);
      await deleteAccountData(deps.db, user.id);
    } catch (error) {
      if (!(error instanceof AppError && error.code === ErrorCode.AccountDeleted)) throw error;
    }
    deps.provisioner.forget(session.clerkId);
    try {
      await deps.accounts.deleteUser(session.clerkId);
    } catch (error) {
      throw new AppError(
        502,
        ErrorCode.AccountDeletionIncomplete,
        "Your data is deleted, but your sign-in could not be removed yet. Please try again.",
        { cause: error },
      );
    }
    return c.body(null, 204);
  });

  app.openapi(guarded(listMyCourses), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const entries = await personalList(deps.db, user.id);
    return c.json({ courses: entries.map(toMyCourse) }, 200);
  });

  app.openapi(guarded(listMyCourseRounds), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const rounds = await roundHistory(deps.db, user.id, courseId);
    return c.json({ rounds: rounds.map(toRound) }, 200);
  });
}
