import { logPath, profilePath } from "../social/paths";
import { LayoutMode } from "./layout-preview";

export interface NavDestination {
  label: string;
  to: string | null;
  icon: string;
  log?: boolean;
}

/** Destinations for each layout. A null URL opens sign-in instead of a private page. */
export function mainDestinations(
  layout: LayoutMode,
  username: string | null,
  mobile: boolean,
): NavDestination[] {
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
      { label: "Home", to: "/", icon: "M3 11 12 4l9 7v9h-6v-6H9v6H3z" },
      courses,
      ...(mobile
        ? [
            {
              label: "Log a round",
              to: username ? logPath(username) : null,
              icon: "M12 5v14M5 12h14",
              log: true,
            },
          ]
        : []),
      friends,
      {
        label: "Profile",
        to: username ? profilePath(username) : null,
        icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8M4 21c1-4 4-6 8-6s7 2 8 6",
      },
    ];
  return [
    {
      label: username ? "My ranking" : "Home",
      to: "/",
      icon: "M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10",
    },
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
