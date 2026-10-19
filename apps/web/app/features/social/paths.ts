import type { PublicMember } from "@coursebook/domain/friends/types";

/** Path of a member's profile, optionally a tab: `/u/<username>/ranking`. */
export function profilePath(username: string, tab?: string): string {
  return "/u/" + encodeURIComponent(username) + (tab ? "/" + tab : "");
}

/** Where "Log a round" goes: Home with the Log dialog open. */
export function logPath(): string {
  return "/?log=1";
}

/** The name a member goes by on screen: display name first, username as the fallback. */
export function displayName(member: PublicMember): string {
  return member.displayName.trim() || member.username;
}
