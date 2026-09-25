import { createHash } from "node:crypto";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { RankedCourse } from "@coursebook/domain/catalog/course";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toRankingEntry, toSearchHit } from "../contract/mappers";
import { listRankings, searchCourses } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { etagMatches } from "../http/etag";
import { publishedRankings } from "../services/catalog";
import { AppError, ErrorCode } from "../services/errors";
import { SEARCH_UNAVAILABLE } from "../services/search";

/**
 * The rankings body and its ETag, computed once per catalog snapshot. The
 * snapshot's rankings array is replaced whenever the catalog reloads, so it
 * keys the cache and stale entries are collected with it.
 */
const rankingsCache = new WeakMap<readonly RankedCourse[], { body: { entries: ReturnType<typeof toRankingEntry>[] }; etag: string }>();

function rankingsBody(rankings: readonly RankedCourse[]) {
  let cached = rankingsCache.get(rankings);
  if (!cached) {
    const body = { entries: rankings.map(toRankingEntry) };
    const etag = '"' + createHash("sha256").update(JSON.stringify(body)).digest("base64url").slice(0, 22) + '"';
    cached = { body, etag };
    rankingsCache.set(rankings, cached);
  }
  return cached;
}

const isAbort = (error: unknown) => error instanceof Error && error.name === "AbortError";

/** Published rankings and course search. */
export function registerCatalogRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(listRankings, async (c) => {
    const { body, etag } = rankingsBody(await publishedRankings(deps.db));
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    if (etagMatches(c.req.header("if-none-match"), etag)) return c.body(null, 304);
    return c.json(body, 200);
  });

  app.openapi(searchCourses, async (c) => {
    await requireUser(c, deps.provisioner);
    const { q } = c.req.valid("query");
    try {
      const results = await deps.search.search(q, c.req.raw.signal);
      return c.json({ results: results.map(toSearchHit) }, 200);
    } catch (error) {
      if (isAbort(error)) throw error;
      throw new AppError(503, ErrorCode.SearchUnavailable, SEARCH_UNAVAILABLE, { cause: error });
    }
  });
}
