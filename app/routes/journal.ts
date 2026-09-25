import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/journal";
import { requireUser } from "../server/auth.server";
import { courseInputSchema, type CourseInput } from "@coursebook/api/services/catalog";
import { db } from "../server/db.server";
import { AppError } from "@coursebook/api/services/errors";
import {
  addCustomCourse,
  addFromFriend,
  addFromRankings,
  deleteCourse,
  deleteRound,
  logRounds,
  moveCourse,
  roundHistory,
  setCount,
} from "@coursebook/api/services/journal";
import { countryFromLocation, deriveState } from "@coursebook/domain/catalog/geography";
import { courseSchema } from "@coursebook/domain/catalog/course";

/**
 * Every journal mutation posts here with an `intent` field. Each intent runs
 * one transaction for the signed-in user; the user id never comes from the
 * form. Fetchers read `{ ok, message, ... }` or `{ error }`; a thrown `AppError`
 * (404) or 401 data response is returned as a reply so dialogs can show it.
 *
 * GET with `courseId` returns the caller's round history for that course.
 */

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
  z.object({ intent: z.literal("top"), courseId: uuid }),
  z.object({ intent: z.literal("friend"), courseId: uuid }),
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
  z.object({ intent: z.literal("delete-course"), courseId: uuid }),
]);

export type JournalIntent = z.infer<typeof intentSchema>;

import type { JournalReply } from "../features/journal/use-journal-fetcher";

export type { JournalReply };

const failure = (message: string, status = 400) => data({ error: message }, { status });

/** Parse the course field of a `log` submission into a course input. */
function courseInputFrom(
  form: Extract<JournalIntent, { intent: "log" }>,
): { input: CourseInput } | { error: string } {
  if (form.courseId) return { input: { courseId: form.courseId } };
  if (!form.course) return { error: "Choose a course first." };
  let raw: unknown;
  try {
    raw = JSON.parse(form.course);
  } catch {
    return { error: "That course could not be read." };
  }
  const parsed = courseInputSchema.safeParse(raw);
  if (!parsed.success || "courseId" in parsed.data) return { error: "That course could not be read." };
  return { input: { ...parsed.data, isCustom: false } };
}

/** US courses need a resolvable state before they are stored. */
function missingUSState(input: Exclude<CourseInput, { courseId: string }>): boolean {
  const course = courseSchema.parse({ id: "input", ...input });
  return (
    countryFromLocation(course.location, course.country) === "USA" &&
    !deriveState({ ...course, country: "USA" })
  );
}

const isReply = (error: unknown): error is { data: JournalReply; init: ResponseInit | null } =>
  typeof error === "object" && error !== null && "data" in error && "init" in error;

export async function loader({ request, context }: Route.LoaderArgs) {
  const user = requireUser(context);
  const courseId = uuid.safeParse(new URL(request.url).searchParams.get("courseId"));
  if (!courseId.success) return failure("Course id required.");
  return { rounds: await roundHistory(db, user.id, courseId.data) };
}

export async function action({ request, context }: Route.ActionArgs) {
  try {
    const user = requireUser(context);
    const parsed = intentSchema.safeParse(Object.fromEntries(await request.formData()));
    if (!parsed.success) {
      const message = parsed.error.issues.find((issue) => issue.message && !issue.message.startsWith("Invalid"))?.message;
      return failure(message ?? "That request was not understood.");
    }
    const form = parsed.data;
    switch (form.intent) {
      case "log": {
        const course = courseInputFrom(form);
        if ("error" in course) return failure(course.error);
        const { input } = course;
        if (!("courseId" in input) && missingUSState(input))
          return failure("Select a state before logging this U.S. course");
        const result = await logRounds(db, user.id, input, form.quantity, form.playedAt);
        return {
          ok: true as const,
          message: `${String(result.count)} round${result.count === 1 ? "" : "s"} added`,
          count: result.count,
          courseId: result.courseId,
        };
      }
      case "top":
        await addFromRankings(db, user.id, form.courseId);
        return { ok: true as const, message: "Added to My List" };
      case "friend": {
        const { added } = await addFromFriend(db, user.id, form.courseId);
        return { ok: true as const, message: added ? "Added to My List" : "Already on your list", added };
      }
      case "add-course": {
        if (form.country === "USA" && !form.state) return failure("Select a state for a U.S. course");
        const input = {
          name: form.name,
          city: form.city,
          state: form.country === "USA" ? form.state : "",
          country: form.country,
          location: [form.city, form.country === "USA" ? form.state : "", form.country].filter(Boolean).join(", "),
          logo: "",
          website: "",
          isCustom: true,
        };
        const result = await addCustomCourse(db, user.id, input, form.rank ?? null);
        return { ok: true as const, message: "Course added at #" + String(result.rank), rank: result.rank, courseId: result.courseId };
      }
      case "move": {
        const result = await moveCourse(db, user.id, form.courseId, form.rank);
        return { ok: true as const, message: "Moved to #" + String(result.rank), rank: result.rank };
      }
      case "set-count": {
        const result = await setCount(db, user.id, form.courseId, form.count);
        return {
          ok: true as const,
          message: result.removed ? "Course removed" : "Rounds updated to " + String(result.count),
          ...result,
        };
      }
      case "delete-round": {
        const result = await deleteRound(db, user.id, form.roundId);
        return {
          ok: true as const,
          message: result.removedCourse ? "Round deleted; course removed from My List" : "Round deleted",
          ...result,
        };
      }
      case "delete-course":
        await deleteCourse(db, user.id, form.courseId);
        return { ok: true as const, message: "Course deleted from My List" };
    }
  } catch (error) {
    if (error instanceof AppError) return failure(error.message, error.status);
    if (isReply(error)) return data(error.data, error.init ?? undefined);
    throw error;
  }
}
