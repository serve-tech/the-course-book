import { ProfileRelationship } from "@coursebook/domain/social/types";
import type { Route } from "./+types/profile.ranking";
import { useProfileData } from "./profile";
import { OwnRanking } from "../features/journal/OwnRanking";
import { displayName } from "../features/social/paths";
import { FriendRanking } from "../features/social/FriendRanking";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * The Ranking tab. On the viewer's own profile it is their ranking, with drag
 * to rank, the details dialog and logging; `?log=1` (the Log a round buttons)
 * opens the Log dialog. On a friend's profile it is their ranking, read-only.
 * Both share the Courses page's layout.
 */
export default function ProfileRanking() {
  const { profile, list } = useProfileData();
  const shell = useShell();
  if (profile.relationship !== ProfileRelationship.Self)
    return (
      <FriendRanking
        rows={list.rows}
        name={displayName(profile.member)}
        selectedState={shell.selectedState}
        onState={shell.onState}
        onSearchFocus={shell.searchFocus}
      />
    );
  return <OwnRanking rows={list.rows} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
