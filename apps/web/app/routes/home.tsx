import { getToken } from "@clerk/react-router";
import { redirect, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { ProgressHome } from "../features/home/ProgressHome";
import { Welcome } from "../features/home/Welcome";
import { api, unwrap } from "../lib/api";
import { LayoutMode } from "../features/shell/layout-preview";
import { readLayoutPreference } from "../features/shell/layout-preference";
import { ActivityFeed } from "../features/social/ActivityFeed";
import { loadFeed } from "../features/social/load-feed";
import { feedKey } from "../features/social/format";
import { logPath } from "../features/social/paths";
import { fromFeedItem, fromMyCourse, fromTopListProgress } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/** Feed items read for the preview's few friends' rounds; enough to find distinct courses past backfills. */
const FEED_SAMPLE = 12;

export const meta: Route.MetaFunction = () => [{ title: "The Course Book" }];

/**
 * Classic loads the friends feed. The opt-in preview loads, in parallel, the
 * member's progress on every published list, the newest feed items and their
 * ranking (decision 2026-10-27). A `?log=1` link opens the Log dialog on the
 * member's own Ranking in either layout.
 */
export async function clientLoader({
  request,
}: Pick<Route.ClientLoaderArgs, "request">) {
  const layout = readLayoutPreference();
  if (!(await getToken())) return { signedIn: false as const };
  if (new URL(request.url).searchParams.get("log") === "1") {
    const me = unwrap(await api.GET("/v1/me"));
    throw redirect(logPath(me.username));
  }
  if (layout === LayoutMode.Classic)
    return { signedIn: true as const, layout, ...(await loadFeed()) };
  const [lists, feed, mine] = await Promise.all([
    api.GET("/v1/top-lists").then(unwrap),
    api
      .GET("/v1/feed", { params: { query: { limit: FEED_SAMPLE } } })
      .then(unwrap),
    api.GET("/v1/me/courses").then(unwrap),
  ]);
  return {
    signedIn: true as const,
    layout,
    standings: lists.lists.map(fromTopListProgress),
    activity: feed.items.flatMap((item) => fromFeedItem(item) ?? []),
    rows: mine.courses.map(fromMyCourse),
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const me = layout?.user?.username;
  if (!loaderData.signedIn || !me) return <Welcome onSignIn={shell.openAuth} />;
  if (loaderData.layout === LayoutMode.Classic)
    return (
      <ActivityFeed
        key={feedKey(loaderData.first)}
        first={loaderData.first}
        hasFriends={loaderData.hasFriends}
        me={me}
        home
      />
    );
  return (
    <ProgressHome
      standings={loaderData.standings}
      activity={loaderData.activity}
      rows={loaderData.rows}
      username={me}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
