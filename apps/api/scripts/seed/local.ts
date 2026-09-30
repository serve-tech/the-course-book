/** Hosts the development seed may write to: this machine only. */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Whether a Postgres URL points at this machine.
 *
 * The seed deletes and rewrites member rows, so any other host (Render, a
 * shared database) is refused, whatever `.env` or the shell says.
 */
export function isLocalDatabaseUrl(url: string): boolean {
  if (!URL.canParse(url)) return false;
  return LOCAL_HOSTS.has(new URL(url).hostname);
}
