import { getToken } from "@clerk/react-router";
import { canCurate, MemberRole, roleFrom, type CommonsCandidate } from "@coursebook/domain/curation/types";
import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/curate";
import { BACK_TO_COURSE, commonsQuery, curationList, CurationTab, membersNote, type CurationEntry } from "../features/curation/curation";
import { listEntries } from "../features/top-lists/lists";
import { CurationPage, type CurationReply } from "../features/curation/CurationPage";
import { api, ApiError, unwrap } from "../lib/api";
import { fromApiCourse, fromCoursePage, fromRankingEntry } from "../lib/api/mappers";
import { apiFailureMessage } from "../shared/lib/errors";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * The curator screen (`/curate`): courses on members' rankings, or on a
 * national published list (`?from=world`), and their photos; a Wikimedia
 * Commons search for one course (`?course=<id>`, with `q` to search for
 * something other than its name, and `back=course` to return to the course's
 * page); and, for admins, who curates
 * (`?tab=curators`). Decision 2026-11-13.
 */
export async function clientLoader({ request }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return null;
  const url = new URL(request.url);
  const role = roleFrom(unwrap(await api.GET("/v1/me")).role);
  if (!canCurate(role)) throw data({ error: "Only curators can change course photos." }, { status: 403 });

  if (url.searchParams.get("tab") === CurationTab.Curators) {
    if (role !== MemberRole.Admin) throw data({ error: "Only admins can change who curates." }, { status: 403 });
    const { members } = unwrap(await api.GET("/v1/admin/members"));
    return { role, tab: CurationTab.Curators, members: members.map((entry) => ({ member: entry.member, role: roleFrom(entry.role) })) } as const;
  }

  const source = curationList(url.searchParams.get("from"));
  // Revalidate (ETag) instead of using the browser's copy, which may be an
  // hour old: a curator must see the photo they just set. The fresh copy
  // then replaces the cached one for the rest of the app.
  const listed: CurationEntry[] = source
    ? listEntries(unwrap(await api.GET("/v1/rankings", { cache: "no-cache" })).entries.map(fromRankingEntry), source).entries.map((entry) => ({
        course: entry.course,
        note: "#" + String(entry.rank),
      }))
    : unwrap(await api.GET("/v1/curation/courses")).courses.map((entry) => ({ course: fromApiCourse(entry.course), note: membersNote(entry.members) }));
  const courseId = url.searchParams.get("course");
  if (!courseId) return { role, tab: CurationTab.Photos, source, courses: listed, picking: null } as const;

  const course =
    listed.find((entry) => entry.course.id === courseId)?.course ??
    fromCoursePage(unwrap(await api.GET("/v1/courses/{courseId}", { params: { path: { courseId } } }))).course;
  const query = (url.searchParams.get("q") ?? commonsQuery(course.name)).trim();
  let candidates: CommonsCandidate[] = [];
  let searchError: string | null = null;
  if (query.length >= 2) {
    try {
      candidates = unwrap(await api.GET("/v1/curation/commons-photos", { params: { query: { q: query } } })).candidates;
    } catch (error) {
      // Commons being down shouldn't hide the course and its current photo.
      if (!(error instanceof ApiError && error.code === "commons_unavailable")) throw error;
      searchError = error.message;
    }
  }
  const backToCourse = url.searchParams.get("back") === BACK_TO_COURSE;
  return { role, tab: CurationTab.Photos, source, courses: listed, picking: { course, query, candidates, searchError, backToCourse } } as const;
}

const intentSchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("set-photo"), courseId: z.uuid(), file: z.string().min(1) }),
  z.object({ intent: z.literal("remove-photo"), courseId: z.uuid() }),
  z.object({ intent: z.literal("set-role"), username: z.string().min(1), role: z.enum(["member", "curator"]) }),
]);

/** Photo and role changes from the curator screen; replies carry a message or an error. */
export async function clientAction({ request }: Route.ClientActionArgs): Promise<CurationReply> {
  const parsed = intentSchema.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { error: "That change could not be read." };
  const form = parsed.data;
  try {
    switch (form.intent) {
      case "set-photo": {
        const course = unwrap(
          await api.PUT("/v1/courses/{courseId}/photo", { params: { path: { courseId: form.courseId } }, body: { commonsFile: form.file } }),
        );
        return { ok: true, message: "Photo set for " + course.name, courseId: form.courseId };
      }
      case "remove-photo": {
        const course = unwrap(await api.DELETE("/v1/courses/{courseId}/photo", { params: { path: { courseId: form.courseId } } }));
        return { ok: true, message: "Photo removed from " + course.name };
      }
      case "set-role": {
        const result = unwrap(
          await api.PUT("/v1/admin/members/{username}/role", { params: { path: { username: form.username } }, body: { role: form.role } }),
        );
        const name = result.member.displayName || result.member.username;
        return { ok: true, message: roleFrom(result.role) === MemberRole.Curator ? name + " is now a curator" : name + " is no longer a curator" };
      }
    }
  } catch (error) {
    const message = apiFailureMessage(error);
    if (message === null) throw error;
    return { error: message };
  }
}

export function meta() {
  return [{ title: "Course photos · The Course Book" }];
}

export default function Curate({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  if (!loaderData) return null;
  return <CurationPage view={loaderData} notify={shell.notify} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
