import type { Route } from "./+types/api.course-search";
import { requireUser } from "../server/auth.server";
import { db } from "../server/db.server";
import { searchCourses } from "@coursebook/api/services/search";
import { errorMessage } from "../shared/lib/errors";

/** JSON resource route: `GET /api/course-search?q=` returns SearchResult[]. */
export async function loader({ request, context }: Route.LoaderArgs) {
  requireUser(context);
  const query = new URL(request.url).searchParams.get("q") ?? "";
  if (query.trim().length < 2)
    return Response.json({ error: "Enter at least two characters." }, { status: 400 });
  try {
    return Response.json(await searchCourses(db, query, request.signal));
  } catch (error) {
    if (request.signal.aborted) throw error;
    return Response.json({ error: errorMessage(error) }, { status: 503 });
  }
}
