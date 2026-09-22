import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/journal";
import { requireUser } from "../server/auth.server";
import { db } from "../server/db.server";
import { addFromRankings } from "../server/journal.server";

/**
 * Every journal mutation posts here with an `intent` field. Each intent runs
 * one transaction for the signed-in user; the user id never comes from the
 * form. Fetchers read `{ ok, message }` or `{ error }`.
 */
const intentSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("top"), courseId: z.uuid() }),
]);

export type JournalIntent = z.infer<typeof intentSchema>;

export async function action({ request, context }: Route.ActionArgs) {
  const user = requireUser(context);
  const parsed = intentSchema.safeParse(
    Object.fromEntries(await request.formData()),
  );
  if (!parsed.success)
    return data({ error: "That request was not understood." }, { status: 400 });

  // A switch on `intent` replaces this once more intents exist.
  await addFromRankings(db, user.id, parsed.data.courseId);
  return { ok: true as const, message: "Added to My List" };
}
