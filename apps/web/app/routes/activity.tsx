import { getToken } from "@clerk/react-router";
import { useRouteLoaderData } from "react-router";
import type { clientLoader as layoutLoader } from "./layout";
import type { Route } from "./+types/activity";
import { ActivityFeed } from "../features/social/ActivityFeed";
import { feedKey } from "../features/social/format";
import { loadFeed } from "../features/social/load-feed";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";
import styles from "../features/social/social.module.css";
import feedStyles from "../features/social/feed.module.css";

export const meta: Route.MetaFunction = () => [
  { title: "Activity · The Course Book" },
];

/** Activity is available in both layouts. */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const };
  return { signedIn: true as const, ...(await loadFeed()) };
}

/** Friends activity has its own destination, separate from the member's ranking. */
export default function Activity({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  const layout = useRouteLoaderData<typeof layoutLoader>("routes/layout");
  const me = layout?.user?.username;
  if (!loaderData.signedIn || !me)
    return (
      <div className={styles.emptyNote}>
        <h1 className={feedStyles.title}>Friends’ activity</h1>
        <p>Sign in to see where your friends are playing.</p>
        <button
          type="button"
          className={styles.button}
          onClick={shell.openAuth}
        >
          Sign in
        </button>
      </div>
    );
  return (
    <ActivityFeed
      key={feedKey(loaderData.first)}
      me={me}
      first={loaderData.first}
      hasFriends={loaderData.hasFriends}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
