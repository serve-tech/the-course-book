import { getToken } from "@clerk/react-router";
import { ProfileRelationship } from "@coursebook/domain/social/types";
import { data } from "react-router";
import type { Route } from "./+types/profile.top-list";
import { useProfileData } from "./profile";
import { availableLists, findList, listEntries } from "../features/top-lists/lists";
import { MemberTopList } from "../features/top-lists/MemberTopList";
import { displayName, profilePath } from "../features/social/paths";
import { api, unwrap } from "../lib/api";
import { fromRankingEntry } from "../lib/api/mappers";
import { loadViewerCourses } from "../lib/api/viewer";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * One published list on a member's profile (`/u/<username>/lists/usa`):
 * the list's courses with the member's ticks and the viewer's. The profile
 * route loads the member; this loads the list and the viewer's courses.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return null;
  const [rankings, viewer] = await Promise.all([api.GET("/v1/rankings").then(unwrap), loadViewerCourses()]);
  const rows = rankings.entries.map(fromRankingEntry);
  const list = findList(params.list, availableLists(rows));
  if (!list) throw data({ error: "There is no published list by that name." }, { status: 404 });
  return { list, entries: listEntries(rows, list).entries, viewer };
}

export default function ProfileTopList({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const { profile, list } = useProfileData();
  if (!loaderData) return null;
  return (
    <MemberTopList
      list={loaderData.list}
      entries={loaderData.entries}
      name={displayName(profile.member)}
      self={profile.relationship === ProfileRelationship.Self}
      memberPlayed={new Set(list.rows.map((row) => row.course.id))}
      viewer={loaderData.viewer}
      backTo={profilePath(profile.member.username, "lists")}
      notify={shell.notify}
      openAuth={shell.openAuth}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
