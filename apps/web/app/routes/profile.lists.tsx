import { redirect } from "react-router";
import type { Route } from "./+types/profile.lists";
import { profilePath } from "../features/social/paths";

/** The Lists tab became part of Stats (list progress) and Want to play; old links and bookmarks keep working. */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(profilePath(params.username, "stats"));
}

export default function ProfileListsRedirect() {
  return null;
}
