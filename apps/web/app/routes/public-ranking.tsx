import { getToken } from "@clerk/react-router";
import { data, useSearchParams } from "react-router";
import type { Route } from "./+types/public-ranking";
import { PublicRanking } from "../features/share/PublicRanking";
import { parseShareView, shareViewParams, type ShareView } from "../features/share/share-view";
import { displayName } from "../features/social/paths";
import { api, ApiError, unwrap } from "../lib/api";
import { fromPublicRanking } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/**
 * Pages stay out of search results for now: a ranking shows a member's real
 * name, and anyone can still open it from a link (decision 2026-11-03).
 */
export const meta: Route.MetaFunction = ({ loaderData }) => [
  { title: (loaderData ? displayName(loaderData.ranking.member) + "'s ranking" : "Ranking") + " · The Course Book" },
  { name: "robots", content: "noindex" },
];

/** A member's public ranking; anyone may load it, signed in or not. */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  const [signedIn, ranking] = await Promise.all([
    getToken().then(Boolean),
    api
      .GET("/v1/members/{username}/ranking", { params: { path: { username: params.username } } })
      .then(unwrap)
      .then(fromPublicRanking)
      .catch((error: unknown) => {
        throw error instanceof ApiError && error.code === "member_not_found"
          ? data({ error: "This ranking isn't available. Check the link." }, { status: 404 })
          : error;
      }),
  ]);
  return { signedIn, ranking };
}

/** The page behind a shared link. The view lives in the link, so what you see is what you share. */
export default function PublicRankingRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const [params, setParams] = useSearchParams();
  const onView = (view: ShareView) => {
    setParams(shareViewParams(view), { replace: true });
  };
  return (
    <PublicRanking
      ranking={loaderData.ranking}
      view={parseShareView(params)}
      onView={onView}
      signedOut={!loaderData.signedIn}
      onJoin={shell.openAuth}
      notify={shell.notify}
      onSearchFocus={shell.searchFocus}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
