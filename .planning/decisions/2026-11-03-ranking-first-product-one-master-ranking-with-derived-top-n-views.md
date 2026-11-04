# Ranking-first product: one master ranking with derived Top N views

**Date:** 2026-11-03
**Status:** Accepted

Amends the product direction in [Social redesign](2026-09-29-social-redesign-top-lists-profiles-timelines-and-star-ratings.md) and replaces Home in [Progress-first preview Home](2026-10-27-progress-first-preview-home.md). Ends the rollout in [Opt-in layout preview](2026-10-19-opt-in-layout-preview-in-production.md) when the new Home ships. [Friends-only visibility](2026-09-29-friends-only-visibility-with-mutual-friend-requests.md) stays for everything except rankings, which become public.

## Context

After a brainstorm with the product owners, the maintainer gave the corrected vision: the app answers "What are my top N courses?" across geographies and categories. The ranking is the main focus. What the owners most want is to share a link to their rankings, and to add every course they have ever played without pain, with courses "naturally appearing" as on Letterboxd. Rounds should matter so little that the app would barely change without them. The owners do not need activity tracking or reviews.

The two earlier Homes were deliberately rough things to put in front of the owners so they could say more about what they want. They are not evidence against another redesign. The owners called both "perfect" at first and changed their minds after thinking about them, so first approval is provisional.

Code findings that shape this decision:

- Every way the web app adds a course also logs a round. Deleting a course's last round, or setting its count to zero, removes it from the list (`services/journal.ts`).
- `user_courses.personal_rank` is NOT NULL and contiguous, so a new course must land somewhere: the frustration behind this work.
- Region tabs on the Ranking page are read-only by choice. The drag code already computes the target against the full order (`features/journal/MyRanking.tsx`).
- Another member's ranking is a 404 for anyone but their accepted friends. Signed-out visitors get a sign-in prompt (`routes/profile.tsx`).
- The web app is one static `index.html`, so every shared link would show the same preview in messaging apps.
- The catalog has no course type and no coordinates. Measurements of the likely source are in [the research](../research/2026-11-03-course-data-and-golf-integrations.md).

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
- **Rankings are public, and sharing is the headline feature.** Anyone with the link can open a member's ranking, signed in or not, with no off switch (maintainer, 2026-11-03). A member can send a link to their ranking or to a view of it. Only the ranking, display name, username and stats computed from the courses (Courses, States, Countries, most courses in a state) are public, because the owners liked the profile Stats. Timeline, stats that need rounds, Want to play and friends stay friends-only. Pages stay out of search results for now.
- **Tall ranking image.** One owner wants what his fantasy football app does: a full-height image rather than what fits on screen. Copy link and Save image sit beside the view's title on the member's own ranking and on the public page; a separate Share link was rejected on 2026-11-04 because it hid the image a click away and looked tacked on. The image holds every course in the current view, however long, with the member's name, the view and the link. A web page cannot intercept the screenshot gesture, so it is a button; a native app could offer it after a screenshot later. The browser draws it on a canvas from a pure layout function, with no new dependency and no server load, and it is capped under iOS Safari's reported 16.7 MP canvas limit because over-limit canvases fail silently. Server rendering can come later if native apps or previews need it.
- **Played and Ranked are two valid states.** A member's course is Played, Ranked or neither. Played is not a to-do: nothing nags a member to rank it, and friends see both states.
- **Rounds barely matter.** The test: every screen works for a member with no rounds. Existing rounds stay; nothing is deleted. What the course details dialog shows about rounds stays as it is for now, because the maintainer does not mind either way.
- **Adding courses works like Letterboxd's "watched".** One tap marks a course Played, with no date and no dialog. Courses to tap come from home state first, then nearby courses and others at the same resort, then published lists and friends. Letterboxd's own FAQ calls its dateless "watched" mark the best way to back-fill.
- **Home.** Home leads with the member's Top N, a view picker and Copy link and Save image. It opens on the Top 10 once a member has more than ten courses, else every course. Once Played exists, Played courses sit in a collapsed line above the ranking, so a long list cannot bury it.
- **Classic is retired** with the new Home, along with the preview control and preference. The new Home is the default for everyone.
- **Categories.** Start with public vs private only, read as course type rather than who can see a ranking. Later candidates are course style, architect, length, and rating, slope or par. OpenGolfAPI's data has type at 93%, but architect and total yardage at 3% and no style.
- **Activity shows people's ranking updates and is de-emphasized**, outside the main navigation. A `ranked_at` timestamp on the course, set when a member places or moves it, is enough: "Josh ranked Pine Valley #4". This replaces the event table first considered. The tradeoff is that only the latest change per course shows, with no "moved from #12 to #4".

Build order, proposed by Claude. On 2026-11-04 the maintainer moved Home ahead of Played and Ranked, so step 3 ships first, without the Played line, and step 2 adds it:

1. Public rankings with Copy link and Save image, on today's ranking; rich link previews follow once the Render rewrite is tested
2. Played and Ranked, with one-tap adding and no round required
3. Home as the ranking with Share; Classic retired; Activity and Timeline out of the main navigation
4. Course data merge, for coverage, coordinates and the public/private filter (on hold; see Open)
5. First-run adding, with courses appearing by geography and resort (catalog only, without nearby courses, until step 4)
6. "Better or worse?" placement, with drag kept

Deferred on the same terms:

- **GHIN and 18Birdies sync.** USGA's Golfer Product Access form lists a $6,000 annual fee and a signed agreement, is primarily for handicap integration, and asks for iOS and Android app locations. No public 18Birdies API was found. Members' GHIN passwords will not be collected.
- **Map.** It needs a map tile source. The state list solves the same typing problem first.
- **Photos and logos.** Waiting on the 2026-10-19 research questions.

Dropped from the plan: star ratings, reviews, undated rounds (a course no longer needs a round) and member-made lists.

## Open

- **Licensing, tabled by the maintainer on 2026-11-03.** Whether a merged catalog that member rankings point to counts as an ODbL derivative database, and what would have to be published. Step 4 waits for a human read, so nearby courses and the OpenGolfAPI-sourced public/private filter wait too.

## Consequences

- **Data rules change.** These rules in `docs/architecture.md` and `AGENTS.md` are replaced when step 2 ships: the "deleting the last round deletes the membership" rule; zero count removing a course; ranks being contiguous over all memberships (they become contiguous over ranked memberships). Friends-only text changes with step 1.
- **Schema.** `personal_rank` becomes nullable and `ranked_at` is added, both backward-compatible while the previous release serves as long as it never reads a null it cannot handle. `courses` gains a type column and coordinates in step 4.
- **Contract.** Grows only. `MyCourse.rank` and the add and log responses require an integer, so existing operations keep returning ranked courses and adding through them keeps its behavior; Played courses get new operations and an additive field. `FeedItem.type` already allows new values, and the web skips an item with no round.
- **Public exposure is new.** The public page needs an anonymous API operation, shows the member's display name (a full name from Clerk), and must leave out email, ids and round details. The API has no rate limiting today.
- **A promise to members changes.** The privacy page said only friends see a member's list, so it changes in the same PR as public rankings. The maintainer confirmed the 12 current members need no notice, because the app is pre-production.
- **The API serves some HTML.** Link previews need per-link HTML that a static site cannot produce. Built as a Render rewrite of `/r/*` to the API, which answers with the web app's `index.html` plus a card, so people and messaging apps get one response. The card carries the app's icon, not a generated image. Render's docs allow a full URL as a rewrite destination but do not describe proxy behavior. The maintainer chose local testing over a test deploy (2026-11-04), so the rewrite is first exercised when it merges. It is a separate commit that can be held back, and a dropped query string would only make the card less specific, because the page reads the view from the browser's address. This is a narrow exception to the JSON-only API.
- **Data quality becomes visible.** The Glen Club's wrong location and the 13 duplicate catalog pairs were left alone under the [import decision](2026-09-28-import-supabase-member-data-1-for-1.md). They now affect the headline feature and need the maintainer's decision.
- **The data merge is its own project.** OpenGolfAPI adds rows and coordinates but is missing the whole Bandon Dunes resort, has messy names and duplicates, and must not rename catalog rows. About 270 catalog courses would need coordinates from elsewhere. It also requires a specific credit wherever the data appears. Today the app only says "Showing results from OpenGolfAPI." in the search dialog, even though Search more courses can already store its data.
- **"People who played X also played Y" waits.** With 12 members and 282 list entries (2026-10-28) there is too little data.
- **Production.** Retiring Classic changes what all members see. Each step ships through a normal PR, and the owners should live with a step before the next one builds on it.
- **Length, rating and slope are per tee**, not per course, and an architect list can have several names. Each needs its own modelling decision before it becomes a category.
