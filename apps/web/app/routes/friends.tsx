import { getToken } from "@clerk/react-router";
import type { PublicMember } from "@coursebook/domain/friends/types";
import { data } from "react-router";
import type { Route } from "./+types/friends";
import { FriendsPage } from "../features/friends/FriendsPage";
import { api, ApiError, unwrap, type ApiSchemas } from "../lib/api";
import { fromMemberList } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Friends · coursebook.golf" }];

/** Every page of the member directory. */
async function allMembers(): Promise<PublicMember[]> {
  const members: PublicMember[] = [];
  let cursor: string | null = null;
  do {
    const page: ApiSchemas["Members"] = unwrap(
      await api.GET("/v1/members", { params: { query: { limit: 200, ...(cursor ? { cursor } : {}) } } }),
    );
    members.push(...page.members);
    cursor = page.nextCursor;
  } while (cursor);
  return members;
}

async function memberList(username: string) {
  try {
    return fromMemberList(unwrap(await api.GET("/v1/members/{username}", { params: { path: { username } } })));
  } catch (error) {
    if (error instanceof ApiError && error.code === "member_not_found")
      throw data({ error: "No member with that username." }, { status: 404 });
    throw error;
  }
}

/** Anonymous visitors see the page with a sign-in prompt; member data needs a session. */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return { signedIn: false as const, members: [], selected: null };
  const [members, selected] = await Promise.all([
    allMembers(),
    params.username ? memberList(params.username) : Promise.resolve(null),
  ]);
  return { signedIn: true as const, members, selected };
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

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
