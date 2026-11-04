import type { OpenAPIHono } from "@hono/zod-openapi";
import { parseShareView } from "@coursebook/domain/sharing/view";
import type { AppDependencies, Logger } from "../app";
import { genericCard, pageWithCard, pageWithoutApp, shareCard, type ShareCard } from "../domain/share-card";
import type { AppEnv } from "../http/env";
import { loggableError } from "../http/loggable-error";
import { publicRanking } from "../services/friends";

/** The member named in a `/r/<username>` path; null when there is none or it cannot be read. */
function usernameInPath(path: string): string | null {
  const [, , segment] = path.split("/");
  if (!segment) return null;
  try {
    return decodeURIComponent(segment);
  } catch {
    return null; // A malformed link names no one; the page says so like any other unknown member.
  }
}

/**
 * Shared ranking links, as HTML: the one narrow exception to the JSON-only API
 * (decision 2026-11-03, ranking-first product). A static site serves the same
 * page for every path, so messaging apps would draw the same card for every
 * link. The static site rewrites `/r/*` here (render.yaml), and this answers
 * with the web app's page plus a card for that member and view.
 *
 * Everyone gets the same response, because a rewrite cannot tell a person from
 * a messaging app. So a failure to build the card must never stop the page:
 * it falls back to a generic card, and the app reports the problem as usual.
 * It sits outside `/v1` and the contract, and answers for every `/r/*` path, as
 * the static site's own rewrite did.
 */
export function registerSharePageRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies, logger: Logger): void {
  const cardFor = async (path: string, params: { get(name: string): string | null }): Promise<ShareCard> => {
    const username = usernameInPath(path);
    if (!username) return genericCard(deps.webUrl);
    try {
      const ranking = await publicRanking(deps.db, username);
      return ranking ? shareCard(ranking, parseShareView(params), deps.webUrl) : genericCard(deps.webUrl);
    } catch (error) {
      logger.error("Could not build a share card", loggableError(error), { path: "/r/*" });
      return genericCard(deps.webUrl);
    }
  };

  app.get("/r/*", async (c) => {
    const { searchParams, pathname } = new URL(c.req.url);
    const [card, shell] = await Promise.all([cardFor(pathname, searchParams), deps.webShell.read()]);
    const page = shell === null ? null : pageWithCard(shell, card);
    // Same as the static site's headers in render.yaml, which this page stands in for.
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("X-Frame-Options", "DENY");
    c.header("X-Robots-Tag", "noindex");
    c.header("Cache-Control", "no-cache");
    return page === null ? c.html(pageWithoutApp(card), 503) : c.html(page);
  });
}
