import { redirect } from "react-router";
import type { Route } from "./+types/profile.index";
import { profilePath } from "../features/social/paths";

/** A profile opens on the ranking, the point of the app (decision 2026-11-03, ranking-first product). */
export function clientLoader({ params }: Route.ClientLoaderArgs) {
  return redirect(profilePath(params.username, "ranking"));
}

export default function ProfileIndex() {
  return null;
}
