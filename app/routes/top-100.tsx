import type { Route } from "./+types/top-100";
import { RankingsPage } from "../features/catalog/RankingsPage";
import { getAppUser } from "../server/auth.server";
import { publishedRankings } from "../server/catalog.server";
import { db } from "../server/db.server";
import { listSummary } from "../server/journal.server";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Top 100 · coursebook.golf" }];

export function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store" };
}

export async function loader({ context }: Route.LoaderArgs) {
  const user = getAppUser(context);
  const [rankings, summary] = await Promise.all([
    publishedRankings(db),
    user ? listSummary(db, user.id) : { played: {}, onList: [] },
  ]);
  return { rankings, ...summary, signedIn: user !== null };
}

export default function Top100({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  return (
    <RankingsPage
      rows={loaderData.rankings}
      played={loaderData.played}
      onList={loaderData.onList}
      signedIn={loaderData.signedIn}
      selectedState={shell.selectedState}
      onState={shell.onState}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
      openAuth={shell.openAuth}
    />
  );
}
