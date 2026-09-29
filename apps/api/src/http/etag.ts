/**
 * Whether an If-None-Match header matches a response's entity tag.
 *
 * Uses the weak comparison RFC 9110 prescribes for If-None-Match: the `W/`
 * prefix is ignored. This matters in practice because the compression
 * middleware marks the ETag weak when it gzips the body, and clients send
 * back exactly what they received.
 *
 * Args:
 *     ifNoneMatch: The request header, possibly a comma-separated list or `*`.
 *     etag: The current tag, strong or weak, e.g. `"abc"` or `W/"abc"`.
 */
export function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  const opaque = (tag: string) => tag.trim().replace(/^W\//, "");
  const wanted = opaque(etag);
  return ifNoneMatch.split(",").some((tag) => opaque(tag) === wanted);
}
