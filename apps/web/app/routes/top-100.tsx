import { getToken } from "@clerk/react-router";
import type { Route } from "./+types/top-100";
import { RankingsPage } from "../features/catalog/RankingsPage";
import { api, unwrap } from "../lib/api";
import { fromRankingEntry } from "../lib/api/mappers";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Top 100 · coursebook.golf" }];

/**
 * Published rankings (public and cacheable, requested without a token) and,
 * for members, which of those courses they played or listed.
 */
export async function clientLoader() {
  const signedIn = (await getToken()) !== null;
  const [rankings, mine] = await Promise.all([
    api.GET("/v1/rankings"),
    signedIn ? api.GET("/v1/me/courses") : Promise.resolve(null),
  ]);
  const courses = mine ? unwrap(mine).courses : [];
  return {
    rankings: unwrap(rankings).entries.map(fromRankingEntry),
    played: Object.fromEntries(courses.filter((entry) => entry.played > 0).map((entry) => [entry.course.id, entry.played])),
    onList: courses.map((entry) => entry.course.id),
    signedIn,
  };
}
clientLoader.hydrate = true as const;

export function HydrateFallback() {
  return <p className="empty">Loading the rankings…</p>;
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
