import { getToken } from "@clerk/react-router";
import { ProfileRelationship } from "@coursebook/domain/social/types";
import { topListProgress } from "@coursebook/domain/social/top-lists";
import type { Route } from "./+types/profile.lists";
import { profileUnavailable, useProfileData } from "./profile";
import { displayName } from "../features/social/paths";
import { TopListsView } from "../features/social/TopListsView";
import { api, unwrap } from "../lib/api";
import { fromWantToPlay } from "../lib/api/mappers";
import { loadViewerCourses } from "../lib/api/viewer";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * Every published list entry reduced to what progress needs (public and
 * cacheable), the member's Want to play list, and the viewer's courses for
 * the row buttons.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return null;
  try {
    const [rankings, wantToPlay, viewer] = await Promise.all([
      api.GET("/v1/rankings").then(unwrap),
      api.GET("/v1/members/{username}/want-to-play", { params: { path: { username: params.username } } }).then(unwrap),
      loadViewerCourses(),
    ]);
    return {
      entries: rankings.entries.map((entry) => ({ courseId: entry.course.id, type: entry.type, scope: entry.scope })),
      wantToPlay: fromWantToPlay(wantToPlay),
      viewer,
    };
  } catch (error) {
    throw profileUnavailable(error);
  }
}

/** The Lists tab: Top list progress, Want to play, and member lists to come. */
export default function ProfileLists({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const { profile, list } = useProfileData();
  if (!loaderData) return null;
  const memberPlayed = new Set(list.rows.map((row) => row.course.id));
  return (
    <TopListsView
      progress={topListProgress(loaderData.entries, memberPlayed)}
      username={profile.member.username}
      name={displayName(profile.member)}
      self={profile.relationship === ProfileRelationship.Self}
      wantToPlay={loaderData.wantToPlay}
      memberPlayed={memberPlayed}
      viewer={loaderData.viewer}
      notify={shell.notify}
      openAuth={shell.openAuth}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
