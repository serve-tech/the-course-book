import { getToken } from "@clerk/react-router";
import { ProfileRelationship } from "@coursebook/domain/social/types";
import type { Route } from "./+types/profile.stats";
import { profileUnavailable, useProfileData } from "./profile";
import { StatsView } from "../features/social/StatsView";
import { api, unwrap } from "../lib/api";
import { RouteError } from "../shared/ui/RouteError";

/** Every published list entry reduced to what the stats need (public and cacheable). */
export async function clientLoader() {
  if (!(await getToken())) return null;
  try {
    const rankings = await api.GET("/v1/rankings").then(unwrap);
    return { entries: rankings.entries.map((entry) => ({ courseId: entry.course.id, type: entry.type, scope: entry.scope, rank: entry.rank })) };
  } catch (error) {
    throw profileUnavailable(error);
  }
}

/** The Stats tab: where the member has played and their progress through the published lists. */
export default function ProfileStats({ loaderData }: Route.ComponentProps) {
  const { profile, list } = useProfileData();
  if (!loaderData) return null;
  return <StatsView member={profile.member} self={profile.relationship === ProfileRelationship.Self} rows={list.rows} entries={loaderData.entries} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
