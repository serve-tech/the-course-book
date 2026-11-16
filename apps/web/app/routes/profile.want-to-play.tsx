import { getToken } from "@clerk/react-router";
import { ProfileRelationship } from "@coursebook/domain/social/types";
import type { Route } from "./+types/profile.want-to-play";
import { profileUnavailable, useProfileData } from "./profile";
import { displayName } from "../features/social/paths";
import { WantToPlayView } from "../features/social/WantToPlayView";
import { api, unwrap } from "../lib/api";
import { fromWantToPlay } from "../lib/api/mappers";
import { loadViewerCourses } from "../lib/api/viewer";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/** The member's Want to play list, and the viewer's courses for the row buttons. */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return null;
  try {
    const [wantToPlay, viewer] = await Promise.all([
      api.GET("/v1/members/{username}/want-to-play", { params: { path: { username: params.username } } }).then(unwrap),
      loadViewerCourses(),
    ]);
    return { wantToPlay: fromWantToPlay(wantToPlay), viewer };
  } catch (error) {
    throw profileUnavailable(error);
  }
}

/** The Want to play tab: the courses the member has saved to play. */
export default function ProfileWantToPlay({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const { profile, list } = useProfileData();
  if (!loaderData) return null;
  return (
    <WantToPlayView
      name={displayName(profile.member)}
      self={profile.relationship === ProfileRelationship.Self}
      wantToPlay={loaderData.wantToPlay}
      memberPlayed={new Set(list.rows.map((row) => row.course.id))}
      viewer={loaderData.viewer}
      notify={shell.notify}
      openAuth={shell.openAuth}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
