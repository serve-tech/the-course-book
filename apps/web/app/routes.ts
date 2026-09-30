import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("courses", "routes/top-100.tsx"),
    route("top-100", "routes/top-100-redirect.tsx"),
    route("u/:username", "routes/profile.tsx", [
      index("routes/profile.timeline.tsx"),
      route("ranking", "routes/profile.ranking.tsx"),
      route("lists", "routes/profile.lists.tsx"),
      route("lists/:list", "routes/profile.top-list.tsx"),
      route("stats", "routes/profile.stats.tsx"),
    ]),
    route("friends", "routes/friends.tsx"),
    route("friends/:username", "routes/friend-redirect.tsx"),
    route("account", "routes/account.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("sign-in/*", "routes/sign-in.$.tsx"),
    route("sign-up/*", "routes/sign-up.$.tsx"),
  ]),
  route("journal", "routes/journal.ts"),
] satisfies RouteConfig;
