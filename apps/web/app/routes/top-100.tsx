import { getToken } from "@clerk/react-router";
import type { Route } from "./+types/top-100";
import { TopListsPage } from "../features/top-lists/TopListsPage";
import { api, unwrap } from "../lib/api";
import { fromRankingEntry } from "../lib/api/mappers";
import { loadViewerCourses } from "../lib/api/viewer";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Top lists · coursebook.golf" }];

/**
 * Published rankings (public and cacheable, requested without a token) and,
 * for members, the courses they played and want to play.
 */
export async function clientLoader() {
  const signedIn = (await getToken()) !== null;
  const [rankings, viewer] = await Promise.all([api.GET("/v1/rankings").then(unwrap), signedIn ? loadViewerCourses() : Promise.resolve(null)]);
  return { rankings: rankings.entries.map(fromRankingEntry), viewer };
}

export default function Courses({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  return (
    <TopListsPage
      rows={loaderData.rankings}
      viewer={loaderData.viewer}
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
