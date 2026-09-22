import {
  type RouteConfig,
  index,
  layout,
  route,
} from "@react-router/dev/routes";

export default [
  layout("routes/layout.tsx", [
    index("routes/home.tsx"),
    route("sign-in/*", "routes/sign-in.$.tsx"),
    route("sign-up/*", "routes/sign-up.$.tsx"),
  ]),
  route("healthz", "routes/healthz.ts"),
] satisfies RouteConfig;
