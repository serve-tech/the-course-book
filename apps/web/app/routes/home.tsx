import { getToken } from "@clerk/react-router";
import { useRouteLoaderData } from "react-router";
import type { Route } from "./+types/home";
import type { clientLoader as layoutLoader } from "./layout";
import { HomeFeed, Welcome } from "../features/social/HomeFeed";
import { feedKey } from "../features/social/format";
import { api, unwrap } from "../lib/api";
import { fromFeedItem } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "coursebook.golf" }];

const FIRST_PAGE = 30;

/** The first page of the friends feed, and whether the member has friends (for the empty state). */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const };
  const [feed, friends] = await Promise.all([
    api.GET("/v1/feed", { params: { query: { limit: FIRST_PAGE } } }).then(unwrap),
    api.GET("/v1/members", { params: { query: { limit: 1 } } }).then(unwrap),
  ]);
  return {
    signedIn: true as const,
    first: { items: feed.items.flatMap((item) => fromFeedItem(item) ?? []), nextCursor: feed.nextCursor },
    hasFriends: friends.members.length > 0,
  };
}

/** Home: the friends feed when signed in, a welcome otherwise. */
export default function Home({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const me = layout?.user?.username;
  if (!loaderData.signedIn || !me) return <Welcome onSignIn={shell.openAuth} />;
  return <HomeFeed key={feedKey(loaderData.first)} first={loaderData.first} hasFriends={loaderData.hasFriends} me={me} />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
