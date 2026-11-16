import { courseSchema } from "@coursebook/domain/catalog/course";
import { missingUSState } from "@coursebook/domain/catalog/geography";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toMyCourses } from "../contract/mappers";
import { toCourseInput } from "../contract/requests";
import {
  addCourse,
  addPlayedCourse,
  addToList,
  deleteRound,
  logRounds,
  markPlayed,
  moveCourse,
  removeCourse,
  setPlayCount,
  unrankCourse,
} from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { AppError, ErrorCode } from "../services/errors";
import * as journal from "../services/journal";

/**
 * A U.S. course described by its details must name its state.
 *
 * Raises:
 *     AppError: 400 `us_state_required`.
 */
function requireUSState(input: ReturnType<typeof toCourseInput>): void {
  if (missingUSState(courseSchema.parse({ id: "input", ...input })))
    throw new AppError(400, ErrorCode.UsStateRequired, "Select a state for this U.S. course.");
}

/**
 * Changes to the member's own list. Every response carries the whole list
 * after the change, read in the same locked transaction (`courses`, the
 * ranking, and `unranked`, the rest), so clients replace their copy instead
 * of patching it.
 */
export function registerJournalRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(addToList), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const { playedOn } = c.req.valid("json");
    const result = await journal.addToList(deps.db, user.id, courseId, playedOn ?? undefined);
    return c.json({ added: result.added, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(markPlayed), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const result = await journal.markPlayed(deps.db, user.id, courseId);
    return c.json({ added: result.added, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(addPlayedCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const input = toCourseInput(c.req.valid("json"));
    requireUSState(input);
    const result = await journal.addPlayedCourse(deps.db, user.id, input);
    return c.json({ courseId: result.courseId, added: result.added, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(unrankCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toMyCourses(await journal.unrankCourse(deps.db, user.id, courseId)), 200);
  });

  app.openapi(guarded(addCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const body = c.req.valid("json");
    const input = toCourseInput(body);
    requireUSState(input);
    const result = await journal.addCourseByDetails(deps.db, user.id, input, {
      rank: body.rank ?? null,
      quantity: body.quantity ?? 1,
      playedOn: body.playedOn ?? undefined,
    });
    return c.json({ courseId: result.courseId, rank: result.rank, roundIds: result.roundIds, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(logRounds), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const body = c.req.valid("json");
    const result = await journal.logRounds(deps.db, user.id, { courseId }, body.quantity ?? 1, body.playedOn ?? undefined);
    return c.json({ added: result.count, roundIds: result.roundIds, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(moveCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const { rank } = c.req.valid("json");
    const result = await journal.moveCourse(deps.db, user.id, courseId, rank);
    return c.json({ rank: result.rank, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(setPlayCount), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    const { count } = c.req.valid("json");
    const result = await journal.setCount(deps.db, user.id, courseId, count);
    return c.json({ count: result.count, removed: result.removed, ...toMyCourses(result) }, 200);
  });

  app.openapi(guarded(removeCourse), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { courseId } = c.req.valid("param");
    return c.json(toMyCourses(await journal.deleteCourse(deps.db, user.id, courseId)), 200);
  });

  app.openapi(guarded(deleteRound), async (c) => {
    const user = await requireUser(c, deps.provisioner);
    const { roundId } = c.req.valid("param");
    const result = await journal.deleteRound(deps.db, user.id, roundId);
    return c.json({ courseId: result.courseId, removedCourse: result.removedCourse, ...toMyCourses(result) }, 200);
  });
}
