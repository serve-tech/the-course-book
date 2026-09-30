import { redirect } from "react-router";
import type { Route } from "./+types/friend-redirect";
import { profilePath } from "../features/social/paths";

/** A friend's list moved to their profile; old links and bookmarks keep working. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(profilePath(params.username));
}

export default function FriendRedirect() {
  return null;
}
