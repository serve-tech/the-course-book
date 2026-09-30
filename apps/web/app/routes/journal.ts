import { courseSchema } from "@coursebook/domain/catalog/course";
import { missingUSState } from "@coursebook/domain/catalog/geography";
import { z } from "zod";
import type { Route } from "./+types/journal";
import { replyMessages } from "../features/journal/reply-message";
import type { JournalReply } from "../features/journal/use-journal-fetcher";
import { api, ApiError, unwrap } from "../lib/api";
import { apiFailureMessage } from "../shared/lib/errors";
import { localDate } from "../shared/lib/local-date";
import { fromRound, toCourseDetailsRequest } from "../lib/api/mappers";

/**
 * Every journal change posts here with an `intent` field; the browser-side
 * action calls the API and returns `{ ok, message, ... }` or `{ error }` so
 * dialogs can report the outcome. React Router then reloads the page's data.
 *
 * GET with `courseId` loads the member's round history for that course.
 */

export type { JournalReply };

const uuid = z.uuid();
const blank = (value: unknown) => (value === "" ? undefined : value);
const optionalInt = z.preprocess(blank, z.coerce.number().int().optional());

const intentSchema = z.discriminatedUnion("intent", [
  z.object({
    intent: z.literal("log"),
    courseId: z.preprocess(blank, uuid.optional()),
    course: z.preprocess(blank, z.string().optional()),
    quantity: z.preprocess(blank, z.coerce.number().int().min(1).max(100).default(1)),
    playedAt: z.preprocess(blank, z.iso.date().optional()),
  }),
  z.object({ intent: z.literal("want"), courseId: uuid }),
  z.object({ intent: z.literal("unwant"), courseId: uuid }),
  z.object({
    intent: z.literal("add-course"),
    name: z.string().trim().min(1, "Enter a course name"),
    city: z.string().trim().default(""),
    state: z.string().trim().default(""),
    country: z.string().trim().min(1, "Select a country"),
    rank: optionalInt,
  }),
  z.object({ intent: z.literal("move"), courseId: uuid, rank: z.coerce.number() }),
  z.object({ intent: z.literal("set-count"), courseId: uuid, count: z.coerce.number().int().min(0) }),
  z.object({ intent: z.literal("delete-round"), roundId: uuid }),
  z.object({
    intent: z.literal("undo-log"),
    roundIds: z.string().transform((value) => value.split(",")).pipe(z.array(uuid).min(1).max(100)),
  }),
  z.object({ intent: z.literal("delete-course"), courseId: uuid }),
]);

export type JournalIntent = z.infer<typeof intentSchema>;

/** A searched course's details as the Log Round dialog posts them. */
const postedCourseSchema = z.object({
  name: z.string().min(1),
  location: z.string().default(""),
  city: z.string().default(""),
  state: z.string().default(""),
  country: z.string().default(""),
  logo: z.string().default(""),
  website: z.string().default(""),
});

const failure = (error: string): JournalReply => ({ error });

/** Turn a failed call into a reply the dialogs can show; anything else is a bug and propagates. */
function failureFrom(error: unknown): JournalReply {
  const message = apiFailureMessage(error);
  if (message === null) throw error;
  return failure(message);
}

async function perform(form: JournalIntent): Promise<JournalReply> {
  switch (form.intent) {
    case "log": {
      const playedOn = form.playedAt ?? localDate();
      if (form.courseId) {
        const result = unwrap(
          await api.POST("/v1/me/courses/{courseId}/rounds", {
            params: { path: { courseId: form.courseId } },
            body: { quantity: form.quantity, playedOn },
          }),
        );
        return { ok: true, message: replyMessages.logged(result.added), count: result.added, courseId: form.courseId, roundIds: result.roundIds };
      }
      if (!form.course) return failure("Choose a course first.");
      let raw: unknown;
      try {
        raw = JSON.parse(form.course);
      } catch {
        return failure("That course could not be read.");
      }
      const posted = postedCourseSchema.safeParse(raw);
      if (!posted.success) return failure("That course could not be read.");
      if (missingUSState(courseSchema.parse({ id: "input", ...posted.data })))
        return failure("Select a state before logging this U.S. course");
      const result = unwrap(
        await api.POST("/v1/me/courses", {
          body: { source: "search", course: toCourseDetailsRequest(posted.data), quantity: form.quantity, playedOn },
        }),
      );
      return { ok: true, message: replyMessages.logged(form.quantity), count: form.quantity, courseId: result.courseId, roundIds: result.roundIds };
    }
    case "want":
      unwrap(await api.PUT("/v1/me/want-to-play/{courseId}", { params: { path: { courseId: form.courseId } } }));
      return { ok: true, message: replyMessages.wanted(true) };
    case "unwant":
      unwrap(await api.DELETE("/v1/me/want-to-play/{courseId}", { params: { path: { courseId: form.courseId } } }));
      return { ok: true, message: replyMessages.wanted(false) };
    case "add-course": {
      const us = form.country === "USA";
      if (us && !form.state) return failure("Select a state for a U.S. course");
      const result = unwrap(
        await api.POST("/v1/me/courses", {
          body: {
            source: "manual",
            course: { name: form.name, city: form.city || null, state: us ? form.state : null, country: form.country },
            rank: form.rank ?? null,
            playedOn: localDate(),
          },
        }),
      );
      return { ok: true, message: replyMessages.addedCourse(result.rank), rank: result.rank, courseId: result.courseId };
    }
    case "move": {
      const result = unwrap(
        await api.PUT("/v1/me/courses/{courseId}/rank", {
          params: { path: { courseId: form.courseId } },
          body: { rank: Math.max(1, Math.round(form.rank)) },
        }),
      );
      return { ok: true, message: replyMessages.moved(result.rank), rank: result.rank };
    }
    case "set-count": {
      const result = unwrap(
        await api.PUT("/v1/me/courses/{courseId}/play-count", {
          params: { path: { courseId: form.courseId } },
          body: { count: form.count },
        }),
      );
      return { ok: true, message: replyMessages.counted(result.count, result.removed), count: result.count, removed: result.removed };
    }
    case "delete-round": {
      const result = unwrap(await api.DELETE("/v1/me/rounds/{roundId}", { params: { path: { roundId: form.roundId } } }));
      return {
        ok: true,
        message: replyMessages.deletedRound(result.removedCourse),
        removedCourse: result.removedCourse,
        courseId: result.courseId,
      };
    }
    case "undo-log": {
      let removedCourse = false;
      for (const roundId of form.roundIds) {
        try {
          removedCourse = unwrap(await api.DELETE("/v1/me/rounds/{roundId}", { params: { path: { roundId } } })).removedCourse;
        } catch (error) {
          // Already deleted (a second tap, or from the round history): the undo still holds.
          if (!(error instanceof ApiError && error.code === "round_not_found")) throw error;
        }
      }
      return { ok: true, message: replyMessages.undone(form.roundIds.length, removedCourse), removedCourse };
    }
    case "delete-course":
      unwrap(await api.DELETE("/v1/me/courses/{courseId}", { params: { path: { courseId: form.courseId } } }));
      return { ok: true, message: replyMessages.deletedCourse() };
  }
}

export async function clientAction({ request }: Route.ClientActionArgs): Promise<JournalReply> {
  const parsed = intentSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) {
    const message = parsed.error.issues.find((issue) => issue.message && !issue.message.startsWith("Invalid"))?.message;
    return failure(message ?? "That request was not understood.");
  }
  try {
    return await perform(parsed.data);
  } catch (error) {
    return failureFrom(error);
  }
}

export async function clientLoader({ request }: Route.ClientLoaderArgs): Promise<JournalReply & { rounds?: ReturnType<typeof fromRound>[] }> {
  const courseId = uuid.safeParse(new URL(request.url).searchParams.get("courseId"));
  if (!courseId.success) return failure("Course id required.");
  try {
    const result = unwrap(
      await api.GET("/v1/me/courses/{courseId}/rounds", { params: { path: { courseId: courseId.data } } }),
    );
    return { rounds: result.rounds.map(fromRound) };
  } catch (error) {
    return failureFrom(error);
  }
}

/** Nothing renders here; the route exists for its loader and action. */
export default function Journal() {
  return null;
}
