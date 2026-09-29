/**
 * Authorized-party (`azp`) policy for Clerk session tokens.
 *
 * Browsers send an Origin header to Clerk, so web session tokens carry `azp`
 * with the page's origin; it must be one of our web origins. Native iOS and
 * Android clients send no Origin, so their tokens carry no `azp` and are
 * accepted. `@clerk/backend` cannot express this: since 3.11.1 passing
 * `authorizedParties` rejects every token without `azp`, which would lock out
 * the native apps. The API accepts bearer tokens only and ignores cookies, so
 * there is no cross-site request forgery surface for an absent `azp` to open.
 * See .planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md.
 *
 * Args:
 *     azp: The token's `azp` claim, as decoded (any type).
 *     allowedOrigins: Exact web origins, e.g. `https://coursebook.golf`.
 *
 * Returns:
 *     True when the token may be used.
 */
export function isAuthorizedParty(azp: unknown, allowedOrigins: readonly string[]): boolean {
  if (azp === undefined || azp === null) return true;
  return typeof azp === "string" && allowedOrigins.includes(azp);
}
