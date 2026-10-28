import { profilePath } from "../social/paths";
import { LayoutMode } from "./layout-preview";

export interface NavDestination {
  label: string;
  to: string | null;
  icon: string;
  /** Log a round has no URL: it opens the Log dialog over the current page. */
  log?: boolean;
}

/**
 * Destinations for each layout. A null URL opens sign-in instead of a private page.
 *
 * Note:
 *     The preview's phone tab bar has five slots: Home, My ranking, Log a
 *     round, Courses and Friends. Home links to Activity and the member's
 *     lists, so those two are desktop-only destinations (decision 2026-10-27).
 */
export function mainDestinations(
  layout: LayoutMode,
  username: string | null,
  mobile: boolean,
): NavDestination[] {
  const home = { label: "Home", to: "/", icon: "M3 11 12 4l9 7v9h-6v-6H9v6H3z" };
  const log = {
    label: "Log a round",
    to: null,
    icon: "M12 5v14M5 12h14",
    log: true,
  };
  const courses = {
    label: "Courses",
    to: "/courses",
    icon: "M6 21V3m0 1h11l-2.5 4L17 12H6",
  };
  const friends = {
    label: "Friends",
    to: "/friends",
    icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .8 3.2 2.5 3.6 5.2",
  };
  if (layout === LayoutMode.Classic)
    return [
      home,
      courses,
      ...(mobile ? [log] : []),
      friends,
      {
        label: "Profile",
        to: username ? profilePath(username) : null,
        icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6",
      },
    ];
  const ranking = {
    label: "My ranking",
    to: username ? profilePath(username, "ranking") : null,
    icon: "M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10",
  };
  if (mobile) return [home, ranking, log, courses, friends];
  return [
    home,
    ranking,
    {
      label: "My lists",
      to: username ? profilePath(username, "lists") : null,
      icon: "M6 3h12v18l-6-4-6 4z",
    },
    courses,
    { label: "Activity", to: "/activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
    friends,
  ];
}
