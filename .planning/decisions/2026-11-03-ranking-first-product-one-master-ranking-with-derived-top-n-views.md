# Ranking-first product: one master ranking with derived Top N views

**Date:** 2026-11-03
**Status:** Accepted

Amends the product direction in [Social redesign](2026-09-29-social-redesign-top-lists-profiles-timelines-and-star-ratings.md) and replaces Home in [Progress-first preview Home](2026-10-27-progress-first-preview-home.md). Ends the rollout in [Opt-in layout preview](2026-10-19-opt-in-layout-preview-in-production.md) when the new Home ships. Keeps [Friends-only visibility](2026-09-29-friends-only-visibility-with-mutual-friend-requests.md).

## Context

After a brainstorm with the product owners, the maintainer gave the corrected vision: the app answers "What are my top N courses?" across geographies and categories. The ranking is the main focus. The owners do not need an app to track playing activity, rounds or reviews; the main actions are ranking, re-ranking and moving courses in or out of a Top N.

The two earlier Homes were deliberately rough things to put in front of the owners so they could say more about what they want. They are not evidence against another redesign. The owners called both "perfect" at first and changed their minds after thinking about them, so first approval is provisional.

Code findings that shape this decision:

- Every way the web app adds a course also logs a round. Deleting a course's last round, or setting its count to zero, removes it from the list (`services/journal.ts`).
- `user_courses.personal_rank` is NOT NULL and contiguous, so a new course must land somewhere: the frustration behind this work.
- Region tabs on the Ranking page are read-only by choice. The drag code already computes the target against the full order (`features/journal/MyRanking.tsx`).
- The catalog has no public/private field and no coordinates. The feed is derived from rounds, with no event table.

## Options Considered

1. **One master ranking; every Top N is a filtered view of it (chosen).**
   - Pros: unlimited views with no new storage; views can never contradict each other; reuses `move` and `reorder()`.
   - Cons: reordering inside a view also changes the overall order; no hand-curated lists that disagree with the master.
2. **Independent member-made lists** (the `lists` and `list_courses` tables designed on 2026-09-29).
   - Pros: complete freedom per list.
   - Cons: every list is maintained by hand; a course can be #1 in one list and below a worse course in another, which raises the question of which ranking is real; new tables, operations and screens.
3. **Both now.**
   - Pros: covers every case.
   - Cons: the cost of option 2 for a need the owners do not have. The maintainer confirmed a Top 5 in Michigan should never disagree with the overall order.

## Decision

Option 1.

- **Ranking model.** Each member has one ordered ranking. A Top N is that ranking filtered by geography or category, cut at N, and numbered within the view. It is computed on read, never stored.
- **Reordering in a view.** Dropping A next to B puts A directly next to B in the master ranking. This is the only placement consistent with the order: if A beats B, A also beats whatever B beats. Removing a course from a Top N means moving it below N.
- **Unranked courses.** A course added without a position is unranked, and shows in its own section at the top of the ranking until the member places it or leaves it there.
- **Rounds are optional.** A course can be on a member's list with no rounds. Existing rounds stay; nothing is deleted.
- **Home.** Home leads with the member's Top N and a view picker, with the unranked section above it when it has courses.
- **Classic is retired** with the new Home, along with the preview control and preference. The new Home is the default for everyone.
- **Categories.** Start with public vs private only, read as course type rather than who can see a ranking. Later candidates are course style, architect, length, and rating, slope or par. OpenGolfAPI's schema has `type`, `architect` and `par` fields, with tee yardage, rating and slope behind a separate endpoint, and nothing for style. Its coverage has not been measured.
- **Activity.** Friends' ranking changes appear in an Activity tab that is deliberately de-emphasized. Those changes are recorded as events, because they cannot be derived or backfilled.

Build order, proposed by Claude and not objected to; the maintainer can reorder it:

1. Unranked section, adding a course without a round, and recording ranking events
2. Top N Home with geography views and in-place reordering, retiring Classic
3. "Better or worse?" placement, with drag kept
4. First-run home state and state checklist, plus catalog expansion
5. Public/private data and a share image

Deferred on the same terms:

- **GHIN and 18Birdies sync.** USGA's Golfer Product Access form lists a $6,000 annual fee and a signed agreement, is primarily for handicap integration, and asks for iOS and Android app locations. No public 18Birdies API was found. Members' GHIN passwords will not be collected.
- **Map.** It needs coordinates and a map tile source. A state checklist solves the same typing problem first.
- **Photos and logos.** Waiting on the 2026-10-19 research questions.

Dropped from the plan: star ratings, reviews, undated rounds (a course no longer needs a round) and member-made lists.

## Consequences

- **Data rules change.** These rules in `docs/architecture.md` and `AGENTS.md` are replaced when the first slice ships: the "deleting the last round deletes the membership" rule; zero count removing a course; ranks being contiguous over all memberships (they become contiguous over ranked memberships).
- **Schema.** `personal_rank` becomes nullable, which is backward-compatible while the previous release serves as long as it never reads a null it cannot handle. `ranking_events` is new. `courses` gains an access column in slice 5.
- **Contract.** Grows only. `MyCourse.rank` and the add and log responses require an integer, so existing operations keep returning ranked courses and adding through them keeps its behavior; unranked courses get new operations and an additive field. `FeedItem.type` already allows new values, and the web skips an item with no round.
- **Data quality becomes visible.** The Glen Club's wrong location and the 13 duplicate catalog pairs were left alone under the [import decision](2026-09-28-import-supabase-member-data-1-for-1.md). They now affect the headline feature and need the maintainer's decision.
- **ODbL.** Expanding the catalog from OpenGolfAPI needs a read of its share-alike terms and the attribution it requires.
- **Production.** Retiring Classic changes what all members see. Each slice ships through a normal PR, and the owners should live with a slice before the next one builds on it.
- **Length, rating and slope are per tee**, not per course, and an architect list can have several names. Each needs its own modelling decision before it becomes a category.
