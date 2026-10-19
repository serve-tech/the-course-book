import { getToken } from "../lib/auth-token";
import { redirect, useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { RankingHome } from "../features/home/RankingHome";
import { Welcome } from "../features/home/Welcome";
import { api, unwrap } from "../lib/api";
import { LayoutMode } from "../features/shell/layout-preview";
import { readLayoutPreference } from "../features/shell/layout-preference";
import { ActivityFeed } from "../features/social/ActivityFeed";
import { loadFeed } from "../features/social/load-feed";
import { feedKey } from "../features/social/format";
import { logPath } from "../features/social/paths";
import { fromMyCourse } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = ({ loaderData }) => [
  {
    title:
      loaderData?.signedIn && loaderData.layout === LayoutMode.CourseFirst
        ? "My ranking · The Course Book"
        : "The Course Book",
  },
];

/** Classic loads the friends feed; the opt-in preview loads only the member's ranking. */
export async function clientLoader({
  request,
}: Pick<Route.ClientLoaderArgs, "request">) {
  const layout = readLayoutPreference();
  if (!(await getToken())) return { signedIn: false as const };
  if (layout === LayoutMode.Classic) {
    // A saved Home Log link remains usable after switching back to Classic.
    if (new URL(request.url).searchParams.get("log") === "1") {
      const me = unwrap(await api.GET("/v1/me"));
      throw redirect(logPath(me.username));
    }
    return { signedIn: true as const, layout, ...(await loadFeed()) };
  }
  const mine = unwrap(await api.GET("/v1/me/courses"));
  return {
    signedIn: true as const,
    layout,
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
  return <RankingHome rows={loaderData.rows} username={me} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
