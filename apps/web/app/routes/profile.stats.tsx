import { ProfileRelationship } from "@coursebook/domain/social/types";
import type { Route } from "./+types/profile.stats";
import { useProfileData } from "./profile";
import { StatsView } from "../features/social/StatsView";
import { RouteError } from "../shared/ui/RouteError";

/** The Stats tab: where the member has played and their Top 100 counts, from their ranking. */
export default function ProfileStats() {
  const { profile, list } = useProfileData();
  return <StatsView member={profile.member} self={profile.relationship === ProfileRelationship.Self} rows={list.rows} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
