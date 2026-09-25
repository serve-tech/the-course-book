import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/my-list.tsx"),
    route("top-100", "routes/top-100.tsx"),
    route("friends/:username?", "routes/friends.tsx"),
    route("account", "routes/account.tsx"),
    route("privacy", "routes/privacy.tsx"),
    route("sign-in/*", "routes/sign-in.$.tsx"),
    route("sign-up/*", "routes/sign-up.$.tsx"),
  ]),
  route("journal", "routes/journal.ts"),
  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;
