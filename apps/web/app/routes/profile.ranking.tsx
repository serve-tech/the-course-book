import { ProfileRelationship } from "@coursebook/domain/social/types";
import { useEffect } from "react";
import { useSearchParams } from "react-router";
import type { Route } from "./+types/profile.ranking";
import { useProfileData } from "./profile";
import { MyRanking } from "../features/journal/MyRanking";
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
  const [params, setParams] = useSearchParams();
  const openLog = params.get("log") === "1";

  // The Log dialog opens once per request; drop the flag so a reload or Back does not reopen it.
  useEffect(() => {
    if (openLog)
      setParams(
        (current) => {
          current.delete("log");
          return current;
        },
        { replace: true },
      );
  }, [openLog, setParams]);

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
  return (
    <MyRanking
      rows={list.rows.map((row) => ({ course: row.course, rank: row.rank, played: row.played }))}
      openLog={openLog}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      openAuth={shell.openAuth}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
