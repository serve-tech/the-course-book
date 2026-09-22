/**
 * Liveness probe for Render's health check. The database round-trip is added
 * together with the schema so a failed connection reports 503.
 */
export function loader(): Response {
  return Response.json({ ok: true });
}
