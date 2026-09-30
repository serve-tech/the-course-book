import { ProfileRelationship } from "@coursebook/domain/social/types";
import { topListProgress } from "@coursebook/domain/social/top-lists";
import type { Route } from "./+types/profile.lists";
import { useProfileData } from "./profile";
import { displayName } from "../features/social/paths";
import { TopListsView } from "../features/social/TopListsView";
import { api, unwrap } from "../lib/api";
import { RouteError } from "../shared/ui/RouteError";

/** Every published list entry, reduced to what progress needs. Public and cacheable; no session needed. */
export async function clientLoader() {
  const { entries } = unwrap(await api.GET("/v1/rankings"));
  return { entries: entries.map((entry) => ({ courseId: entry.course.id, type: entry.type, scope: entry.scope })) };
}

/** The Lists tab: Top list progress now; Want to play and member lists to come. */
export default function ProfileLists({ loaderData }: Route.ComponentProps) {
  const { profile, list } = useProfileData();
  const progress = topListProgress(loaderData.entries, new Set(list.rows.map((row) => row.course.id)));
  return (
    <TopListsView progress={progress} self={profile.relationship === ProfileRelationship.Self} name={displayName(profile.member)} />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
