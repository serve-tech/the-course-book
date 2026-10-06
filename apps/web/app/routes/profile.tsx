import { getToken } from "@clerk/react-router";
import type { MemberList } from "@coursebook/domain/friends/types";
import type { Profile } from "@coursebook/domain/social/types";
import { data, Outlet, useRouteLoaderData, type ShouldRevalidateFunctionArgs } from "react-router";
import type { Route } from "./+types/profile";
import { displayName } from "../features/social/paths";
import { ProfileHeader } from "../features/social/ProfileHeader";
import profileStyles from "../features/social/profile.module.css";
import styles from "../features/social/social.module.css";
import { api, ApiError, unwrap } from "../lib/api";
import { fromMemberList, fromProfile } from "../lib/api/mappers";
import { RouteError } from "../shared/ui/RouteError";
import { useShell } from "../shared/ui/shell";

export const meta: Route.MetaFunction = ({ loaderData: loaded }) => [
  { title: (loaded?.signedIn ? displayName(loaded.profile.member) : "Profile") + " · The Course Book" },
];

/** Shown for a member the viewer may not see; the API does not say which case it is. */
export const PROFILE_UNAVAILABLE = "This profile isn't available. It may not exist, or you aren't friends yet.";

/** A 404 for a member the viewer may not see; other failures pass through. */
export function profileUnavailable(error: unknown): unknown {
  return error instanceof ApiError && error.code === "member_not_found" ? data({ error: PROFILE_UNAVAILABLE }, { status: 404 }) : error;
}

/**
 * A profile: the member's header data and their ranking, which the tabs
 * share. The viewer's own profile and accepted friends' only.
 */
export async function clientLoader({ params }: Route.ClientLoaderArgs) {
  if (!(await getToken())) return { signedIn: false as const };
  const path = { params: { path: { username: params.username } } };
  try {
    const [profile, list] = await Promise.all([
      api.GET("/v1/members/{username}/profile", path).then(unwrap),
      api.GET("/v1/members/{username}", path).then(unwrap),
    ]);
    return { signedIn: true as const, profile: fromProfile(profile), list: fromMemberList(list) };
  } catch (error) {
    throw profileUnavailable(error);
  }
}

/**
 * Friend actions from this page only remove the friend, after which the page
 * navigates away; reloading first would flash "not found".
 */
export function shouldRevalidate({ formAction, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  return formAction === "/friends" ? false : defaultShouldRevalidate;
}

/** The profile and ranking the tabs render, from this route's loader. */
export function useProfileData(): { profile: Profile; list: MemberList } {
  const loaded = useRouteLoaderData<typeof clientLoader>("routes/profile");
  if (!loaded?.signedIn) throw new Error("Profile tabs render only inside a signed-in profile");
  return { profile: loaded.profile, list: loaded.list };
}

export default function ProfileRoute({ loaderData }: Route.ComponentProps) {
  const shell = useShell();
  if (!loaderData.signedIn)
    return (
      <div className={styles.emptyNote} style={{ marginTop: 20 }}>
        <strong>Sign in to see profiles</strong>
        Profiles are visible to friends only.{" "}
        <button type="button" className={[styles.button, styles.buttonSolid].join(" ")} onClick={shell.openAuth} style={{ marginTop: 12 }}>
          Sign in
        </button>
      </div>
    );
  return (
    <div className={profileStyles.page}>
      <ProfileHeader profile={loaderData.profile} notify={shell.notify} />
      <Outlet context={shell} />
    </div>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return <RouteError error={error} />;
}
