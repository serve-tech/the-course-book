import { getToken } from "@clerk/react-router";
import { redirect, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { chooseGoalList } from "../features/home/goal-list";
import { ProgressHome } from "../features/home/ProgressHome";
import { Welcome } from "../features/home/Welcome";
import { api, unwrap } from "../lib/api";
import { LayoutMode } from "../features/shell/layout-preview";
import { readLayoutPreference } from "../features/shell/layout-preference";
import { ActivityFeed } from "../features/social/ActivityFeed";
import { loadFeed } from "../features/social/load-feed";
import { feedKey } from "../features/social/format";
import { logPath } from "../features/social/paths";
import { fromFeedItem, fromMyCourse, fromTopListDetail, fromTopListProgress } from "../lib/api/mappers";
import { HOME_GOAL_LIST_KEY, preferences, SELECTED_STATE_KEY } from "../shared/lib/storage";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

/** Feed items read for the preview's few friends' rounds; enough to find distinct courses past backfills. */
const FEED_SAMPLE = 12;

export const meta: Route.MetaFunction = () => [{ title: "The Course Book" }];

/** A browser preference, or null when storage is unavailable (some browsers block the property itself). */
function storedPreference(key: string): string | null {
  try {
    return preferences().read(key);
  } catch (error) {
    console.warn("Could not access saved preferences", error);
    return null;
  }
}

/**
 * Classic loads the friends feed. The opt-in preview (decision 2026-10-27)
 * loads the member's progress on every published list, chooses the list Home
 * tracks (`?goal=`, else the one picked on this device, else the rules in
 * `chooseGoalList`) and loads that list's courses; the newest feed items and
 * the member's ranking load alongside. A `?log=1` link opens the Log dialog
 * on the member's own Ranking in either layout.
 */
export async function clientLoader({
  request,
}: Pick<Route.ClientLoaderArgs, "request">) {
  const layout = readLayoutPreference();
  if (!(await getToken())) return { signedIn: false as const };
  const url = new URL(request.url);
  if (url.searchParams.get("log") === "1") {
    const me = unwrap(await api.GET("/v1/me"));
    throw redirect(logPath(me.username));
  }
  if (layout === LayoutMode.Classic)
    return { signedIn: true as const, layout, ...(await loadFeed()) };

  const homeState = (storedPreference(SELECTED_STATE_KEY) ?? "").toUpperCase();
  const chosen = url.searchParams.get("goal") ?? storedPreference(HOME_GOAL_LIST_KEY);
  const tracked = api
    .GET("/v1/top-lists")
    .then(unwrap)
    .then(async (lists) => {
      const standings = lists.lists.map(fromTopListProgress);
      const goal = chooseGoalList(standings, homeState, chosen);
      const detail = goal
        ? fromTopListDetail(
            unwrap(
              await api.GET("/v1/top-lists/{type}/{scope}", {
                params: { path: { type: goal.standing.list.type, scope: goal.standing.list.scope } },
              }),
            ),
          )
        : null;
      return { standings, goal, goalCourses: detail?.entries ?? [] };
    });
  const [{ standings, goal, goalCourses }, feed, mine] = await Promise.all([
    tracked,
    api
      .GET("/v1/feed", { params: { query: { limit: FEED_SAMPLE } } })
      .then(unwrap),
    api.GET("/v1/me/courses").then(unwrap),
  ]);
  return {
    signedIn: true as const,
    layout,
    homeState,
    standings,
    goal,
    goalCourses,
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
      homeState={loaderData.homeState}
      standings={loaderData.standings}
      goal={loaderData.goal}
      goalCourses={loaderData.goalCourses}
      activity={loaderData.activity}
      rows={loaderData.rows}
      username={me}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
