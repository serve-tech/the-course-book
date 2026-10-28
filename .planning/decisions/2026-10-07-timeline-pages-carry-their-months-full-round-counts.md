# Timeline pages carry their months' full round counts (keyset paging kept)

**Date:** 2026-10-07
**Status:** Accepted

## Context

The profile Timeline groups rounds under month headers ("September 2026 · 5 rounds"). `listMemberRounds` pages with a keyset cursor (20 rounds on the web's first page, then "Show more rounds"), and the web counted only the rounds it had loaded. A month cut off by a page boundary showed a too-small count ("3 rounds") until the next page loaded.

The maintainer asked whether months should be collapsible with older months loaded on demand. They then asked for the per-month counts to be right from the start without loading every month's rounds, and suggested the take/skip-plus-`total` pattern from earlier APIs.

Golf volume is small: the launch import held 711 rounds across 11 members, and a month usually holds a handful of rounds. `rounds_user_played_idx` on `(user_id, played_at)` already exists.

## Options Considered

1. **Collapsible months, each loaded on demand**
   - Pros: long histories fold away.
   - Cons: needs one operation that lists months with counts and another that fetches a single month. It adds a tap per month for months of 2–5 rounds, and loading was never slow.
2. **Offset paging (take/skip) with a `total`**
   - Pros: familiar; `take=0` gives a cheap total.
   - Cons: one total, not a count per month. The timeline has delete buttons, and an offset shifts after a delete, so the next page would skip a round.
3. **Pages end on month boundaries**
   - Pros: counts are right by construction, with no new field.
   - Cons: changes what `limit` means on a published operation, and a busy month makes a page unbounded.
4. **A separate months-summary operation** (`/rounds/months`, every month's count)
   - Pros: the whole history up front; would support year collapse or jump-to-month.
   - Cons: a second request, and two sources that can briefly disagree; nothing needs the full history yet.
5. **Each page carries the full counts of the months it touches** (additive `months` field)
   - Pros: no extra request; counts arrive with the rounds; one bounded GROUP BY per page over an existing index; additive contract change.
   - Cons: only the months already reached are known; the rounds and counts are separate reads, so a round logged between them can be off by one until the next load.

## Decision

Option 5. `Timeline.months` lists `{ month: "YYYY-MM" | null, rounds }` for every month with a round on the page, newest first and undated (`null`) last. `monthWindow` (`apps/api/src/domain/timeline-months.ts`) turns the page's dates into `[first day of oldest month, first day of month after newest)`. `monthCounts` in `services/timeline.ts` runs one GROUP BY over that range, plus undated rounds when the page has them. The web merges the counts from every page it has loaded (`groupByMonth` in `features/social/format.ts`), falling back to the rounds loaded only for a month without a count.

Keyset (cursor) paging stays.

## Consequences

- Additive contract change: the `TimelineMonth` schema and a required `Timeline.months` field. iOS and Android receive it with their first build.
- Undated rounds cannot be stored yet (`rounds.played_at` is NOT NULL until the "played without a date" migration). The `null` month is modelled and unit-tested, but has no database test until then.
- If the Timeline later needs year collapse or jump-to-month, add Option 4 alongside; `months` does not block it.
- Other paged lists that group rows (the feed, if it ever groups by day) can follow the same pattern: page by cursor, and send counts for the groups the page touches.
