import { data } from "react-router";
import type { Route } from "./+types/friends";
import { FriendsPage } from "../features/friends/FriendsPage";
import { getAppUser } from "../server/auth.server";
import { db } from "../server/db.server";
import { memberList, members } from "../server/backend.server";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Friends · coursebook.golf" }];

export function headers(): HeadersInit {
  return { "Cache-Control": "private, no-store" };
}

/** Anonymous visitors see the page with a sign-in prompt; member data needs a session. */
export async function loader({ context, params }: Route.LoaderArgs) {
  const user = getAppUser(context);
  if (!user) return { signedIn: false as const, members: [], selected: null };
  const [directory, selected] = await Promise.all([
    members(db, user.id),
    params.username ? memberList(db, user.id, params.username) : Promise.resolve(null),
  ]);
  if (params.username && !selected)
    throw data({ error: "No member with that username." }, { status: 404 });
  return { signedIn: true as const, members: directory, selected };
}

export default function Friends({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  return (
    <FriendsPage
      signedIn={loaderData.signedIn}
      members={loaderData.members}
      selected={loaderData.selected}
      notify={shell.notify}
    />
  );
}
