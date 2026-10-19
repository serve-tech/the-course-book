import { z } from "zod";

const settings = z.object({
  key: z.string().regex(/^phc_[A-Za-z0-9]+$/, "Use the public PostHog project key, never a personal API key"),
  host: z.enum(["https://us.i.posthog.com", "https://eu.i.posthog.com"]),
});

/** Disabled when unset; partial/invalid configuration fails the build. */
export function telemetryConfig(key: unknown, host: unknown) {
  if (!key && !host) return null;
  return settings.parse({ key, host });
}
