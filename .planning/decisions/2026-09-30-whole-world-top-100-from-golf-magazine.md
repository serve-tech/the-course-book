# Whole-world Top 100 comes from GOLF Magazine, not a merge of Golf Digest's lists

**Date:** 2026-09-30
**Status:** Accepted; imported in migration 0005 (branch feat/world-top-100-and-top-list-api)

## Context

The maintainer wanted an "Entire World (World + USA) Top 100" as the Courses page's default, "to see how Augusta and The Old Course line up". The catalog's two national lists can't produce that:

- Golf Digest's World 100 (2024) excludes US courses: 0 of its 100 are American.
- Golf Digest's USA 100 (2025) is US-only.

The two lists come from different panels, years and scales. Augusta is USA #2 and the Old Course is World #3, and neither list says which is better.

The maintainer also wants each course's rank on every list it appears on, like a recruit's overall, state and position ranks: "Augusta: World #3, USA #2, Georgia #1".

## Options Considered

1. **Merge the two Golf Digest lists** (interleave or alternate ranks)
   - Pros: no new data.
   - Cons: invents a ranking and presents it as published. The app's value is the published consensus lists.
2. **A combined view without a merged rank:** all 200 courses, each labeled with its own list rank
   - Pros: honest, no new data.
   - Cons: still doesn't say how an American course compares with a foreign one.
3. **Import a published whole-world list:** GOLF Magazine's Top 100 Courses in the World, which ranks US and international courses on one scale
   - Pros: real rankings; answers the question.
   - Cons: a data import with a new list type, catalog matching, and courses missing from the catalog.

## Decision

Option 3, chosen by the maintainer on 2026-09-30. GOLF's list becomes a new published list, with its own `ranking_type`, alongside Golf Digest's. `world` stays Golf Digest's, because `course_rankings` allows one rank per course and type. The new list becomes the Courses page default once it lands. Until then the page opens on the USA Top 100, or on the tab last used on the device.

The recruit-style ranks shipped with the Top lists redesign (commit de968f4): every course row lists each of its ranks (`rankBadges` in `apps/web/app/features/top-lists/lists.ts`).

### How the import works (maintainer's answers, 2026-09-30)

- **Names:**
  - GOLF's list is "World" (ranking type `global`, scope `GLOBAL`) and is the Courses page's default tab.
  - Golf Digest's `world` list is relabeled "International". Its type and contract field keep their names, because the contract only grows.
- **Duplicate catalog rows:** GOLF's rank goes on the row that holds the USA rank, so World and USA line up on one row. Merging the duplicates stays a separate decision.
- **Courses not in the catalog:** Ardfin, Childress Hall (Upper) and Nine Bridges are added. If a course with the same name key and country already exists (a member may have added one by hand), that row is ranked instead.
- **Migration:**
  - Postgres cannot use an enum value added in the same transaction, and drizzle applies pending migrations in one transaction. So 0005 recreates `ranking_type` with the new value instead of using `ADD VALUE`.
  - The release before it must skip unknown list types. That's `rankSummaries`, fixed on feat/top-lists-want-to-play.

## Consequences

- **Source:**
  - GOLF's 2025-26 edition (published 2025-11-19): https://golf.com/travel/courses/top-100-courses-world-2025-26/
  - Extracted on 2026-09-30 and cross-checked against the page's tables and its structured list.
  - 90 of 100 courses match one catalog row.
  - 3 courses aren't in the catalog: Ardfin, Childress Hall (Upper), Nine Bridges.
  - 7 courses are ambiguous, meaning two catalog rows each hold a ranking: Friar's Head, The Country Club, Shoreacres, The Lido, Ballyneal, Kiawah Ocean, Old Town.
- **Legacy duplicate rows:**
  - At least 31 US courses have their national rank on one catalog row and their state rank on another, e.g. "Friar's Head" (USA #14) and "Friar's Head Golf Club" (New York #5).
  - Their rows show split rank badges.
  - Progress on one list doesn't count toward the other.
  - Per the 1-for-1 import rule ([decision](2026-09-28-import-supabase-member-data-1-for-1.md)), merging them is a separate data decision for the maintainer. Members' list entries point at specific rows.
- **Contract:** `RankingEntry.type` already allows new list types. `CourseRanks` needs one new field for the course's rank on the new list (additive).
- **Publishing:** the app republishes GOLF's complete ranking, as it already does Golf Digest's.
