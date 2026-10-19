import { getToken } from "@clerk/react-router";
import type { Route } from "./+types/activity";
import { ActivityFeed } from "../features/social/ActivityFeed";
import { feedKey } from "../features/social/format";
import { api, unwrap } from "../lib/api";
import { fromFeedItem } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";
import styles from "../features/social/social.module.css";
import feedStyles from "../features/social/feed.module.css";

export const meta: Route.MetaFunction = () => [
  { title: "Activity · The Course Book" },
];

const FIRST_PAGE = 30;

/** The first page of the friends feed, and whether the member has friends (for the empty state). */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const };
  const [feed, friends] = await Promise.all([
    api
      .GET("/v1/feed", { params: { query: { limit: FIRST_PAGE } } })
      .then(unwrap),
    api.GET("/v1/members", { params: { query: { limit: 1 } } }).then(unwrap),
  ]);
  return {
    signedIn: true as const,
    first: {
      items: feed.items.flatMap((item) => fromFeedItem(item) ?? []),
      nextCursor: feed.nextCursor,
    },
    hasFriends: friends.members.length > 0,
  };
}

/** Friends activity has its own destination, separate from the member's ranking. */
export default function Activity({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  if (!loaderData.signedIn)
    return (
      <div className={styles.emptyNote}>
        <h1 className={feedStyles.title}>Friends’ activity</h1>
        <p>Sign in to see where your friends are playing.</p>
        <button type="button" className={styles.button} onClick={shell.openAuth}>
          Sign in
        </button>
      </div>
    );
  return (
    <ActivityFeed
      key={feedKey(loaderData.first)}
      first={loaderData.first}
      hasFriends={loaderData.hasFriends}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
