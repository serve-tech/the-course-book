import { getToken } from "@clerk/react-router";
import type { FriendRequests, PublicMember } from "@coursebook/domain/friends/types";
import { z } from "zod";
import type { Route } from "./+types/friends";
import {
  FriendIntent,
  UnfriendReason,
  befriendMessage,
  toRelationship,
  unfriendMessage,
} from "../features/friends/friend-actions";
import { FriendsPage } from "../features/friends/FriendsPage";
import { api, expectOk, unwrap, type ApiSchemas } from "../lib/api";
import { apiFailureMessage } from "../shared/lib/errors";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = () => [{ title: "Friends · coursebook.golf" }];

const NO_REQUESTS: FriendRequests = { incoming: [], outgoing: [] };

/** Every page of the viewer's friends. */
async function allFriends(): Promise<PublicMember[]> {
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

/** Anonymous visitors see the page with a sign-in prompt; member data needs a session. */
export async function clientLoader() {
  if (!(await getToken())) return { signedIn: false as const, members: [], requests: NO_REQUESTS };
  const [members, requests] = await Promise.all([allFriends(), api.GET("/v1/me/friend-requests").then(unwrap)]);
  return { signedIn: true as const, members, requests };
}

/** Reply of the Friends action, reported once per submission. */
export interface FriendReply {
  ok?: boolean;
  message?: string;
  error?: string;
}

const friendForm = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal(FriendIntent.Befriend), username: z.string().min(1) }),
  z.object({ intent: z.literal(FriendIntent.Unfriend), username: z.string().min(1), reason: z.enum(UnfriendReason) }),
]);

/**
 * The message for a failed friend action. Unknown errors are logged and
 * reported, never rethrown, so a failure never replaces the page.
 */
function friendFailure(error: unknown): FriendReply {
  const message = apiFailureMessage(error);
  if (message !== null) return { error: message };
  console.error("Friend action failed", error);
  return { error: "Something went wrong. Please try again." };
}

/** Befriend (send or accept a request) or unfriend (remove, cancel, decline). */
export async function clientAction({ request }: Route.ClientActionArgs): Promise<FriendReply> {
  const parsed = friendForm.safeParse(Object.fromEntries(await request.formData()));
  if (!parsed.success) return { error: "That action is not available." };
  const form = parsed.data;
  const path = { params: { path: { username: form.username } } };
  try {
    if (form.intent === FriendIntent.Befriend) {
      const result = unwrap(await api.PUT("/v1/me/friends/{username}", path));
      return { ok: true, message: befriendMessage(toRelationship(result.relationship), result.member.username) };
    }
    expectOk(await api.DELETE("/v1/me/friends/{username}", path));
    return { ok: true, message: unfriendMessage(form.reason, form.username) };
  } catch (error) {
    return friendFailure(error);
  }
}

export default function Friends({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  return (
    <FriendsPage
      signedIn={loaderData.signedIn}
      members={loaderData.members}
      requests={loaderData.requests}
      notify={shell.notify}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
