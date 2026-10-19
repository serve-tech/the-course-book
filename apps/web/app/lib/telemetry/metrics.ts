import { z } from "zod";

export enum Metric {
  Auth = "auth_token",
  Api = "api_headers",
  Loader = "route_loader",
  Action = "route_action",
  Navigation = "navigation_ready",
  Clerk = "clerk_ready",
}

export enum Outcome {
  Ready = "ready",
  Success = "success",
  Error = "error",
  Cancelled = "cancelled",
  Timeout = "timeout",
}

export enum NavigationKind {
  Initial = "initial",
  Navigation = "navigation",
  Revalidation = "revalidation",
}

export interface Measurement {
  metric: Metric;
  duration_ms: number;
  outcome: Outcome;
  route?: string;
  route_id?: string;
  source?: "loader" | "api";
  navigation_kind?: NavigationKind;
  endpoint?: string;
  method?: string;
  status?: number;
  request_id?: string;
  server_ms?: number;
  server_auth_ms?: number;
  server_provision_ms?: number;
}

/** Group URLs without sending usernames, search terms, auth hashes or unknown paths. */
export function routeLabel(pathname: string): string {
  if (/^\/u\/[^/]+\/lists\/[^/]+\/?$/.test(pathname)) return "/u/:username/lists/:list";
  const profile = /^\/u\/[^/]+(?:\/(ranking|lists|stats))?\/?$/.exec(pathname);
  if (profile) return "/u/:username" + (profile[1] ? "/" + profile[1] : "");
  if (/^\/friends\/[^/]+\/?$/.test(pathname)) return "/friends/:username";
  if (/^\/sign-(in|up)(\/|$)/.test(pathname)) return pathname.startsWith("/sign-in") ? "/sign-in/*" : "/sign-up/*";
  return ["/", "/activity", "/courses", "/top-100", "/friends", "/account", "/privacy", "/journal"].includes(pathname) ? pathname : "unknown";
}

export const duration = (start: number, end: number): number => Math.max(0, Math.round(end - start));

export function failureOutcome(error: unknown): Outcome {
  if (error instanceof Error && error.name === "AbortError") return Outcome.Cancelled;
  if (error instanceof Error && error.name === "TimeoutError") return Outcome.Timeout;
  return Outcome.Error;
}

/** Only numeric durations from our named server metrics are accepted. */
export function serverDurations(header: string | null): Pick<Measurement, "server_ms" | "server_auth_ms" | "server_provision_ms"> {
  const result: Pick<Measurement, "server_ms" | "server_auth_ms" | "server_provision_ms"> = {};
  for (const item of header?.split(",") ?? []) {
    const match = /^\s*(app|auth|provision);dur=(\d+(?:\.\d+)?)\s*$/.exec(item);
    if (!match?.[2]) continue;
    const ms = Number(match[2]);
    if (!Number.isFinite(ms)) continue;
    if (match[1] === "app") result.server_ms = ms;
    if (match[1] === "auth") result.server_auth_ms = ms;
    if (match[1] === "provision") result.server_provision_ms = ms;
  }
  return result;
}

const milliseconds = z.number().nonnegative();
/** Strip SDK enrichment too: no URLs, referrers, names, email, tokens or arbitrary errors. */
export const eventProperties = z.object({
  metric: z.enum(Metric),
  duration_ms: milliseconds,
  outcome: z.enum(Outcome),
  route: z.string().max(100),
  visible_route: z.string().max(100).optional(),
  route_id: z.string().regex(/^(root|routes\/[a-zA-Z0-9.$_-]+)$/).optional(),
  layout: z.enum(["classic", "course-first"]),
  release: z.string().max(100),
  environment: z.enum(["development", "production", "test"]),
  token: z.string().regex(/^phc_[A-Za-z0-9]+$/).optional(),
  source: z.enum(["loader", "api"]).optional(),
  navigation_kind: z.enum(NavigationKind).optional(),
  endpoint: z.string().regex(/^\/v1\/[a-zA-Z0-9/{}_-]+$/).optional(),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).optional(),
  status: z.number().int().min(100).max(599).optional(),
  request_id: z.uuid().optional(),
  server_ms: milliseconds.optional(),
  server_auth_ms: milliseconds.optional(),
  server_provision_ms: milliseconds.optional(),
  distinct_id: z.string().max(100).optional(),
  $session_id: z.string().max(100).optional(),
  $window_id: z.string().max(100).optional(),
  $browser: z.string().max(100).optional(),
  $browser_version: z.union([z.string(), z.number()]).optional(),
  $os: z.string().max(100).optional(),
  $device_type: z.string().max(100).optional(),
  $lib: z.string().max(100).optional(),
  $lib_version: z.string().max(100).optional(),
  $process_person_profile: z.literal(false).optional(),
  $geoip_disable: z.literal(true).optional(),
});
