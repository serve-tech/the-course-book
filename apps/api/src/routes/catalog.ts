import { CourseSearchSource } from "@coursebook/domain/catalog/search-results";
import { createHash } from "node:crypto";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { RankedCourse } from "@coursebook/domain/catalog/course";
import type { AppDependencies } from "../app";
import { requireUser } from "../auth/middleware";
import { toRankingEntry, toSearchHit } from "../contract/mappers";
import { listRankings, searchCourses } from "../contract/routes";
import type { AppEnv } from "../http/env";
import { guarded } from "./guard";
import { etagMatches } from "../http/etag";
import { publishedRankings } from "../services/catalog";
import { AppError, ErrorCode } from "../services/errors";
import { SEARCH_UNAVAILABLE } from "../services/search";
import { pageSearchResults } from "../domain/course-search";
import { searchCatalogCourses } from "../services/catalog-search";

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

/** Published rankings and course search. */
export function registerCatalogRoutes(app: OpenAPIHono<AppEnv>, deps: AppDependencies): void {
  app.openapi(guarded(listRankings), async (c) => {
    const { body, etag } = rankingsBody(await publishedRankings(deps.db));
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    if (etagMatches(c.req.header("if-none-match"), etag)) return c.body(null, 304);
    return c.json(body, 200);
  });

  app.openapi(guarded(searchCourses), async (c) => {
    await requireUser(c, deps.provisioner);
    const { q, page, source } = c.req.valid("query");
    if (source !== CourseSearchSource.External) {
      const paged = await searchCatalogCourses(deps.db, q, page ?? 1);
      return c.json({ ...paged, results: paged.results.map(toSearchHit) }, 200);
    }
    try {
      const results = await deps.search.search(q, c.req.raw.signal);
      const paged = pageSearchResults(results, page ?? 1);
      return c.json({ ...paged, results: paged.results.map(toSearchHit) }, 200);
    } catch (error) {
      // A cancelled request lands here too, with its abort reason (a string
      // from @hono/node-server). Wrap it all the same, keeping it as the
      // cause: Hono passes only Errors to the error handler, which finds the
      // reason in the cause chain (isCancellation) and does not log it.
      throw new AppError(503, ErrorCode.SearchUnavailable, SEARCH_UNAVAILABLE, { cause: error });
    }
  });
}
