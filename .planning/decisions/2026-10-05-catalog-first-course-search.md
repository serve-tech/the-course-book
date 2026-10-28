# Catalog-first course search with optional external discovery

**Date:** 2026-10-05
**Status:** Accepted by the maintainer

## Context
Searching Oakland did not find Oakland University: Katke-Cousins, even though
that named course already exists in the seeded catalog. Search previously
returned only external hits, relevance-sorted and truncated to ten, with a
50-candidate cap. Catalog rows only resolved external identities.

## Options Considered
1. **Paginate external-only discovery:** expands coverage but still hides stored
   courses absent from upstream and depends on its availability for every query.
2. **Always combine catalog and external:** covers both but delays routine
   searches and couples availability, totals and ordering to an external source.
3. **Catalog first, explicit external discovery:** reliable stored-course search,
   with one extra action when the catalog does not contain the desired course.
4. **Catalog only:** simple, but removes the existing broader discovery workflow.

## Decision
The maintainer chose option 3. Keep `/v1/course-search`, add optional `page`
and `source=catalog|external` query parameters, and default to catalog/page 1.
Keep the `results` shape and add always-present `page`, `pageSize` and `total`.
Both modes sort alphabetically by name, then location and id, with ten per page.
The dialog offers Search more courses and Back to catalog, fetches each page
anew, and resets to catalog/page 1 on query changes.

## Consequences
- Catalog search queries `courses` directly, includes shared custom courses,
  and returns stored identities and ranking badges. It never calls discovery.
- No data correction, duplicate-row merge or schema migration is included.
- Matching requires every whitespace-separated query term in the stored name,
  case-insensitively; SQL wildcard characters are literal.
- For this small catalog, all matching rows are read and sorted/paged with the
  same pure functions as external discovery. This trades bounded application
  work for consistent ordering and simple Previous/Next behavior. If the catalog
  grows substantially, move paging into SQL and measure substring indexes;
  no index or cursor migration is needed for this change.
- External discovery reads matching upstream pages under one overall timeout,
  resolves/deduplicates, then sorts before paging. CSV fallback is not truncated.
- External searches retain a limited discovery deadline and may fall back to
  the published dataset for broad queries. They do not affect catalog searches.
- Existing clients still decode results and receive the first page, but their
  default source now becomes the local catalog as explicitly requested.

Upstream pagination reference (checked 2026-10-05):
https://api.opengolfapi.org/openapi.json (`limit`, `offset`, `total`).
