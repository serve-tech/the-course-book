# Played and Ranked: design for #52

**Date:** 2026-11-15
**Status:** Proposed. Waiting on the maintainer's answers in section 7 before any code is written.
**Issue:** #52, step 2 of the [ranking-first decision](../decisions/2026-11-03-ranking-first-product-one-master-ranking-with-derived-top-n-views.md); tracking issue #62.

## Summary

A course on a member's list is either **Ranked** (it has a place in their ranking) or **Played** (it doesn't). Both mean "I've played it", and neither needs a round. One tap marks a course Played. Nothing ever drops a new course into the ranking for the member: they place it when they want to, and until then it sits in a collapsed Played line above the ranking on Home.

In the database this is one change: `user_courses.personal_rank` may be empty, and an empty rank means Played. The API keeps every existing operation working exactly as old clients expect (their lists only ever contain Ranked courses) and adds three operations, a few fields and one request option. The work ships as two pull requests: the API first, the web once the API is live, so neither half ever talks to a version of the other that doesn't understand Played.

## Words used here

| Word | Meaning |
| --- | --- |
| **List** | Every course the member has played: Ranked and Played together. One `user_courses` row each. |
| **Ranking** | The Ranked courses in order, #1 to #N. |
| **Ranked** | On the list with a rank. |
| **Played** | On the list without a rank. In the API contract this is called **unranked**, because the contract already uses `played` for a round count (`MyCourse.played`, `MemberCourse.played`, `TopListEntry.played`). Two meanings for one field name would confuse native-app developers forever, since names are permanent. Screens say "Played". |

## 1. Schema and migration

### The change

Migration `0007` is one statement, which is exactly what drizzle-kit generates when `personalRank` loses `.notNull()` in `schema.ts` (checked by generating it and throwing it away):

```sql
ALTER TABLE "user_courses" ALTER COLUMN "personal_rank" DROP NOT NULL;
```

Postgres documents a table scan only for adding NOT NULL, not for dropping it ([ALTER TABLE](https://www.postgresql.org/docs/17/sql-altertable.html)); the statement takes a brief exclusive lock on `user_courses`, so the old release's requests wait a moment behind it. The table holds a few hundred rows, so it finishes at once either way. Every existing row keeps its rank, so after the migration nothing is Played until a member makes something Played. The migration goes in its own commit. If the photo-storage branch merges a `0007` first, this one is regenerated as `0008`; nothing else changes.

There is no down migration. Putting NOT NULL back would first need every Played course ranked or deleted, which is a decision about members' data, not a schema step.

### What keeps ranks in order

| Rule | How it holds after the change |
| --- | --- |
| A rank is positive | `user_courses_rank_positive` (`personal_rank > 0`) stays. A null passes a CHECK, so Played rows are allowed. |
| No two Ranked courses share a rank | The deferred unique constraint `user_courses_user_rank_unique (user_id, personal_rank)` stays. Postgres treats nulls as distinct in a unique constraint, so a member can have any number of Played courses. Tested on the local database: two Played rows for one member insert fine. |
| Ranks run 1..N with no gaps, over Ranked courses only | Not a database constraint today, and still not one. The service keeps it: every change to the ranking renumbers the whole ranking from its order (`renumber`), and from now on that order is the Ranked rows only. Tests check it after every operation (section 6). |
| Fast reads by rank | `user_courses_user_rank_idx (user_id, personal_rank)` stays; nulls are indexed too. No new index: a member's list is read whole and is a few hundred rows at most. |

I considered a deferred constraint trigger that checks `count(personal_rank) = max(personal_rank)` per member at commit. I'm not adding it. It would be the schema's first trigger, drizzle-kit can't express it (a hand-written migration, like `0002`), it runs once per changed row at commit, and it wouldn't catch the one real hazard below (the old release ranking Played courses keeps ranks contiguous). The service-level rule plus tests is how contiguity has always been kept.

Making the column nullable also changes Drizzle's row type to `number | null`, so the TypeScript compiler points at every reader of `personalRank`. That is how the build finds every place that needs a decision.

### Rounds and memberships

The composite foreign key `rounds_membership_fk` stays: a round still needs its course on the list, Ranked or Played, and removing a course still deletes its rounds. What goes away is the reverse rule, which only ever lived in the service: a course no longer needs a round to stay on the list. Deleting a course's last round, or setting its count to zero, leaves the course where it was.

### `ranked_at` waits for #54

Adding the column later is a one-line nullable `ADD COLUMN`, as cheap as adding it now, so it isn't clearly cheaper to do it here. Keeping `0007` to the single change that the deploy overlap has to survive keeps the risky part small and easy to review. The cost: Activity (#54) can only show placements made after #54 ships, not the burst of ranking that will follow this release. If the maintainer wants that history, the column and its two write sites (placing and moving a course) can join PR A in about 30 lines. #54's acceptance criteria already define when it's set.

### The deploy overlap

The API runs migrations when it starts, while the previous release is still serving, and browsers keep old web bundles until the member reloads. Four pairings need to be safe.

**What today's code does when it meets an empty rank.** Measured on the local test database with today's services, after dropping NOT NULL and inserting Played rows by hand:

| Today's code path | What happened |
| --- | --- |
| `personalList`, `memberRanking`, `publicRanking` | Played rows come back with `rank: null`, after the Ranked ones (ascending order puts nulls last). The public ranking would publish them. |
| `timelineRounds` | A round at a Played course comes back with `rank: null`. |
| `coursePage` | `you.rank` is null, so the page says "Not on your ranking"; `outOf` counts the Played rows. |
| Logging a new course (`ensureMembership`) | Bottom is `max(rank) + 1`, which ignores nulls. Correct. |
| Logging at a Played course | It stays Played. |
| `moveCourse`, `addCourseByDetails` at any rank, deleting a course's last round, a zero count, `removeCourse` | Each renumbers the whole list, Played rows included, so **every Played course silently becomes Ranked at the bottom**. Nothing is lost, but the member's Played line is emptied into their ranking. |

The old web draws whatever rows it gets and numbers them by position (`MyRanking`, `viewRows`), so Played courses would show as #N+1 onwards, including on the public page.

**How the design makes each pairing safe:**

1. **Old API release while the new one starts.** Render keeps all traffic on the old instance until the new one passes its health check, then sends all new traffic to the new one; 60 seconds later it tells the old one to shut down, so requests already in flight can finish ([Render: deploys](https://render.com/docs/deploys)). The old release meets an empty rank only if someone has written one. During PR A's deploy nobody can: the only writers are the new operations, and no web bundle calls them until PR B. So the old release never sees a Played row.
2. **New API, old web bundles.** The new API never puts a Played course in the fields old bundles read. `courses` in every response stays Ranked-only, with integer ranks; Played courses travel only in the new `unranked` fields, which old bundles ignore. An old bundle simply doesn't show Played courses. If it logs a round at one through the old operations, that course goes to the bottom of the ranking, which is what that old screen has always done (section 2).
3. **New web, old API.** Both Render services deploy from the same `main` commit, and the static site usually finishes before the API's Docker build, so in a single PR the new web could call operations that don't exist yet. Shipping the API in PR A and the web in PR B, after PR A is confirmed live, closes this.
4. **Rollback.** A Render rollback reuses the old build ([Render: rollbacks](https://render.com/docs/rollbacks)); the migration stays applied. Rolling the API back past PR A once members have Played courses gives exactly the table above: the public ranking shows Played courses, and the first move ranks them all. The rule for this release: **once PR B is live, never roll the API back past PR A; roll forward with a fix.** A rollback from the Render dashboard also turns auto-deploy off. This goes in the PR description and in `docs/architecture.md` under Migrations.

## 2. The API

### Every existing operation

| Operation | How it treats a Played course |
| --- | --- |
| `getMe`, `getClientConfig`, `listRankings`, `searchCourses` | Unchanged. |
| `listMyCourses` | `courses` stays the ranking only, in rank order. New `unranked`: Played courses, most recently Played first. |
| `listMyCourseRounds` | Unchanged; works for Played courses. |
| `addToList` | Unchanged behavior for old clients: a course that isn't ranked (new to the list, or Played) goes to the bottom of the ranking, with one round if it has none. The web stopped calling it in #16. |
| `addCourse` | Same: a course that isn't ranked goes to `rank` (bottom when omitted). Its response must carry an integer `rank`, which is why Played adds by details need a new operation. |
| `logRounds` | Without the new `addUnranked` option, unchanged: a course that isn't ranked goes to the bottom. With `addUnranked: true`, a course new to the list joins as Played, a Played course stays Played, and a Ranked course keeps its rank. New response field `courseAdded`. |
| `moveCourse` | Ranked course: unchanged. Played course: it is placed into the ranking at `rank` (clamped to 1..N+1); the courses from there down move down one. This is how a member ranks a Played course; no new operation is needed. |
| `setPlayCount` | Lowering deletes the oldest rounds, raising logs rounds dated today, as now. Zero deletes every round and **keeps the course** (PR B). `removed` stays in the response and is always false. |
| `removeCourse` | Unchanged: takes a Ranked or Played course off the list with its rounds; ranks below close up. |
| `deleteRound` | Deletes the round and **keeps the course**, even when it was the last one (PR B). `removedCourse` stays and is always false. |
| `getMemberList` | `courses` stays the member's ranking. New `unranked`: their Played courses. `onMyList` is true when the course is on the viewer's list, Ranked or Played; `myRank` is null unless the viewer ranked it. |
| `getPublicRanking` | Ranked courses only; Played courses never appear (pending question 2). |
| `getMemberProfile` | `stats.courses` counts Ranked and Played. `topFour` and `comparison` use Ranked courses only, on both sides. |
| `listMemberRounds`, `getFeed` | Every round, including rounds at Played courses. New `TimelineRound.personalRank` is null for those (see below). |
| `listWantToPlay`, `addWantToPlay`, `removeWantToPlay` | Unchanged. A Played course can be on Want to play ("play it again"). |
| `listTopLists` | Progress (`mine`, friends' counts) counts Ranked and Played. This was already the query; it's now the stated rule. |
| `getTopList` | `played` stays the viewer's round count. New `onMyList` says whether the course is on the viewer's list, which is what ticks should use, since a Played course may have no rounds. `friendsPlayed` already counts friends' whole lists. |
| `getCourse` | `you.rank` is null for a Played course. New `you.onMyList`. `you.outOf` and each friend's `outOf` now count Ranked courses only (they count every membership today). `friendsRanked` is Ranked only; new `friendsUnranked` lists friends who have it Played. |
| `listMembers`, `searchMembers`, `listFriendRequests`, `befriendMember`, `removeFriend` | Unchanged. |
| `deleteMe` | Unchanged; Played courses go with the rest of the list. |
| `listCurationCourses` | Counts members with the course anywhere on their list, Played included, since Played rows show photos too. Description changes from "ranking" to "list". |
| `searchCommonsPhotos`, `setCoursePhoto`, `removeCoursePhoto`, `listMemberRoles`, `setMemberRole` | Unchanged. |

Every operation that changes the list already returns the whole list read in the same transaction (`courses`). Each of those responses (`AddedToList`, `AddedCourse`, `LoggedRounds`, `MovedCourse`, `PlayCount`, `DeletedRound`, and `MyCourses` from `removeCourse`) gains `unranked` beside it, so the rule "a change returns the whole list" still holds.

### New operations

All three need a session, take the member lock and return the whole list.

| `operationId` | Request | Response | Behavior |
| --- | --- | --- | --- |
| `markPlayed` | `PUT /v1/me/played-courses/{courseId}`, no body | `AddedToList` (`added`, `courses`, `unranked`) | One-tap Played for a catalog course. A course not on the list joins as Played with no rank and no round, and comes off Want to play (as logging a round does). A course already on the list, Ranked or Played, is left alone and `added` is false, so retrying is safe. 404 `course_not_found`. |
| `addPlayedCourse` | `POST /v1/me/played-courses`, body `AddPlayedCourseRequest` | `AddedPlayedCourse` | Played for a course described by its details: an outside search hit, or a course typed in by hand. Resolves or creates the course through `identity.ts` exactly as `addCourse` does, then adds it as Played. With `quantity`, it also logs that many rounds on `playedOn`; without, no rounds. Idempotent without `quantity`. 400 `us_state_required` and `validation_failed` as `addCourse`. |
| `unrankCourse` | `DELETE /v1/me/courses/{courseId}/rank` | `MyCourses` | Takes a course out of the ranking. It stays on the list as Played with its rounds; the ranks below close up. A Played course is left alone, so retrying is safe. 404 `not_on_list`. |

`/v1/me/played-courses` mirrors `/v1/me/courses`: PUT by catalog id, POST by details. It has no GET or DELETE: Played courses are read through `listMyCourses.unranked` and removed with `removeCourse`.

### New schemas and fields

| Name | Shape | Notes |
| --- | --- | --- |
| `MyUnrankedCourse` | `{ course: Course, played: int ≥ 0 }` | `played` is the round count, as in `MyCourse`. |
| `MemberUnrankedCourse` | `{ course, onMyList, played, lastPlayedOn, myRank }` | `MemberCourse` without `rank`. |
| `AddPlayedCourseRequest` | `{ course: CourseDetailsRequest, source: CourseSource, quantity?, playedOn? }` | `quantity` is 1..100 and means "rounds to log; none when omitted". The opposite default from `addCourse` is deliberate and documented on the field. |
| `AddedPlayedCourse` | `{ courseId, added, roundIds, courses, unranked }` | `added` as in `AddedToList`. |
| `MyCourses.unranked` and the six list-change responses | `MyUnrankedCourse[]` | Most recently Played first. |
| `MemberList.unranked` | `MemberUnrankedCourse[]` | Same order. |
| `LogRoundsRequest.addUnranked` | `boolean`, optional | "True: a course not on the list joins it as Played instead of at the bottom of the ranking." |
| `LoggedRounds.courseAdded` | `boolean` | True when this call put the course on the list. Undo then removes the course (`removeCourse`), because deleting its rounds no longer does. |
| `TopListEntry.onMyList` | `boolean` | As on `MemberCourse`. |
| `CourseStanding.onMyList` | `boolean` | Same name and meaning everywhere in the contract. |
| `CoursePage.friendsUnranked` | `Member[]` | Friends with the course Played, by name. |
| `TimelineRound.personalRank` | `int ≥ 1`, nullable | The member's rank for the course; null when it is Played. |

**The one awkward field.** `TimelineRound.rank` (used by the timeline and the feed) is a required integer, and the contract may not make it nullable: that's a retype, which breaks generated Swift and Kotlin clients. A round at a Played course has no rank to report. Hiding those rounds would make a just-logged round vanish from the member's own timeline, since logging now adds courses as Played. So `rank` keeps its type and, for a Played course only, carries the ranking's size plus one ("below the ranking"). Its description says so and points clients to `personalRank`, which is the honest value. Only stale old web bundles ever read the stand-in. Every other `rank` in the contract stays honest, because Played courses appear only in the new `unranked` arrays.

No new error codes.

## 3. Data rules

These replace "a round cannot exist without a membership... deleting the last round deletes the membership", "zero removes the course" and "ranks are contiguous 1..N per user" in `AGENTS.md` and `docs/architecture.md`.

- **Two states.** A course on a member's list is Ranked (personal rank 1..N) or Played (no rank). Both mean the member has played it. Neither needs a round. Played is not unfinished, and nothing prompts a member to rank a Played course.
- **Ranks** run 1..N with no gaps over Ranked courses only. Any change that adds to, removes from or reorders the ranking renumbers the whole ranking from its full order, so courses a view hides keep their places. Played courses are never touched by a renumber.
- **Getting on the list.** `markPlayed` and `addPlayedCourse` add a course as Played, optionally with rounds. `logRounds` with `addUnranked` adds a new course as Played. The old operations (`addToList`, `addCourse`, `logRounds` without the option) put a course that isn't ranked at the bottom of the ranking, or at `rank`, as they always have; they exist for old clients. The new web only uses the first three.
- **Leaving the list.** Only `removeCourse`, which deletes the course's rounds. Deleting rounds and lowering the count, even to zero, never remove a course.
- **Rank** (placing a Played course): `moveCourse` inserts it at the requested position, clamped to 1..N+1. Courses at and below that position move down one.
- **Move** a Ranked course: unchanged (`reorder`).
- **Unrank**: `unrankCourse` empties the course's rank and closes the gap. Rounds and Want to play are untouched.
- **Logging and counts** never change a course's rank or state. A round still requires its course on the list; the foreign key enforces it.
- **Want to play.** Logging a round, or marking a course Played when that adds it to the list, takes it off Want to play.
- **Played order.** Most recently Played first: by `updated_at`, which a Played row only gets when it becomes Played (added, or taken out of the ranking), since renumbering touches Ranked rows only. Ties go by name. A test pins this down.
- **The member lock** covers every write to a member's list, rounds and Want to play, the new operations included: each runs as one transaction under `withJournalLock`, and the whole list, Ranked and Played, is read in that transaction and returned. Two quick taps, or a tap racing a drag in another tab, are applied one after the other, never interleaved.
- **Visibility.** Played courses follow the friends rule (the member and their accepted friends). The public ranking is the Ranked courses only (pending question 2).

The pure parts move into `packages/domain/src/journal/reorder.ts`: `placeInRanking(ranked, id, rank)` (move a Ranked course or insert a Played one, with the clamping above), and `reorder` and `insertAt` as now. The services do I/O and call these.

## 4. The web, screen by screen

New intents on the `/journal` action: `played` (`markPlayed` by id), `played-details` (`addPlayedCourse`), `unrank`, and `move` reused for placing. `undo-log` learns to remove a course the log added. No new state library or store; the route loaders read `unranked` from the same calls they already make.

**Home** (`HomeRanking` over `OwnRanking`/`MyRanking`):

- **The Played line** sits under the page header, above the view controls, so a long ranking can't bury it. Collapsed it is one line: "Played · 12 courses", with a Show button. Open, it lists the Played courses as photo rows without numbers, most recent first, with a search once there are more than ten (the existing threshold). Each row links to the course page and has a Rank button. Open or closed is component state, not stored. The line isn't shown when nothing is Played.
- **Ranking a Played course**: see question 1. The recommended version: Rank switches the ranking to every course (no Top N cut, no region), and a banner asks "Where does Pine Valley go? Tap the course it's better than", with "After all of them" and Cancel. A tap places it directly above that course (`moveCourse` to that course's rank). The toast says "Ranked #7" with Undo, which takes it back out. The course page's Rank it button links to `/?place=<courseId>`, which opens Home in this mode.
- **Back to Played**: Take out of ranking, in the Reorder view's course details dialog and on the course page. No confirmation; Undo in the toast puts it back at its old rank.
- **Empty states.** Nothing on the list: "Mark the courses you've played", with Find a course (the search dialog) and a link to the Courses page. Played courses but nothing ranked: the Played line opens by itself, and the ranking area says "Nothing ranked yet. Tap Rank on a course above to start your ranking." Ranking text that says "Log your first round" changes, here and on the Top Four.
- Opening on the Top 10 counts Ranked courses only.

**Profile, own Ranking tab**: the same component, so the same Played line and placement. Its rows come from `getMemberList`.

**Course page** (`CoursePageView`, the Standing panel):

- Not on the list: **Played it**, now one tap (`markPlayed`; it opens the Log dialog today), Want to play, and a quieter Log a round.
- Played: "Played", with **Rank it**, Log a round and "Remove from your list" (confirmed only when it has rounds). No "not ranked yet" wording.
- Ranked: "#4 of 42" (out of Ranked courses), See your ranking, Log a round, Take out of ranking.
- Friends: "Friends who rank it" as now, then "Played it: Dan, Maya" from `friendsUnranked`, then Want to play.

**Courses page Top list rows** (`CourseActions`, shared with member lists): a Played button joins Log a round and Want to play. Not on the list: one tap marks it Played, with the toast "Added to Played" and Undo. On the list, the button shows as pressed. Pressing it again takes the course off only if nothing would be lost (Played, no rounds); otherwise it does nothing and its tooltip says "On your list". Ticks, the Played and Not played filters and the progress bar read `onMyList` instead of the round count, so a Played course with no rounds is ticked. The tick opens round history only when there are rounds.

**Search dialog** (`LogRoundDialog`): each hit gets a Played button: catalog hits call `markPlayed`, outside hits call `addPlayedCourse` with their details. Tapping a hit's name still selects it for logging. The toast says "Added to Played", or "Already on your list" when `added` is false, so the dialog doesn't need the member's list to decide anything.

**Log a round for a course not on the list**: the course joins as Played and the rounds are logged (`logRounds` with `addUnranked`, or `addPlayedCourse` with `quantity` for an outside hit). The toast's Undo removes the course when `courseAdded` is true, else deletes the rounds it logged, as now.

**Add a course by hand** (`AddCourseDialog`): the rank field goes, and Save adds the course as Played with no round (`addPlayedCourse`, `source: manual`). Today it logs a round dated today, which is the invented round the decision wants gone.

**A friend's ranking** (their profile's Ranking tab): their Played line, collapsed and read-only, above their ranking. Rows carry the viewer's mark: "You #4" when the viewer ranked it, "You played" when the viewer has it Played. The Both played and Only them filters count the viewer's whole list.

**Member lists and the Lists tab** (`/u/<username>/lists/...`): the member's ticks come from their whole list (`courses` plus `unranked`), the viewer's from the viewer's whole list (`loadViewerCourses` switches from round counts to list membership). These rows already use `CourseActions`, so they get the Played button with no extra work.

**Profile header and Stats**: Courses counts Ranked and Played. States, Countries, "Most courses in" and Most played on the Stats tab, and the national progress beside the Timeline, read the whole list. Top Four is ranks 1 to 4.

**Timeline and Activity**: a round at a Played course shows a "Played" label where "#4 Your ranking" would be (`personalRank` is null).

**The public page `/r/<username>`**: Ranked courses only, and its Courses, States and Countries count Ranked courses only, so it never reveals a Played course (pending question 2). The privacy page changes to match: the ranking is public; Played courses, rounds and Want to play are for friends.

**A member with no rounds**: Home, the course page, Top lists, profiles, Stats (Rounds 0, no Most played), Timeline (its existing empty state) and the public page all work from list membership alone. An e2e scenario signs in as a member with only Played and Ranked courses and no rounds, and opens each page.

**Stale tabs**: a browser still running the old bundle sees only Ranked courses until it reloads, and anything it adds goes to the bottom, as before.

## 5. What existing numbers mean now

| Number | Counts |
| --- | --- |
| Profile Courses (header, Stats) | Ranked and Played: every course the member has played. Same query as today. |
| Rounds, This year | Rounds, unchanged. |
| Top list progress ("12 / 100 played", friends' counts) | Ranked and Played. Ticks now agree with it, because they read `onMyList`. |
| Member lists and the Lists tab | Ranked and Played, for both the member and the viewer. |
| States, Countries, Most courses in (Stats tab) | Ranked and Played. |
| Public page Courses, States, Countries | Ranked only (pending question 2). |
| "N courses" beside a ranking view, Copy link, Save image | The Ranked courses in that view. |
| Course page "#3 of 42", a friend's "#5 of 80" | Out of Ranked courses only (all memberships today). |
| Courses in common, agreement, biggest split | Courses both members have ranked. |
| Curators' "members with it" | Members with it anywhere on their list. |

## 6. Tests and docs

**Pure functions** (data-driven, colocated):

- `placeInRanking`: inserting a Played course at the top, middle and bottom, past the end, at 0 or NaN; moving a Ranked course (same results as `reorder`); input never mutated.
- Web: the rank a "tap the course it beats" placement posts (including "after all of them" and a filtered order), when the Played line opens by itself, stats over Ranked plus Played rows, the viewer's list as a set, the mappers for the new fields (`personalRank`, `unranked`, `onMyList`), reply messages.

**Service tests against the database** (`journal.db.test.ts` and its neighbours). A shared `expectContiguousRanks(db, userId)` runs after every write:

- `markPlayed`: adds as Played with no round and no rank; takes the course off Want to play; repeating it, or calling it on a Ranked course, changes nothing.
- `addPlayedCourse`: resolves an existing course, creates a custom one, requires a U.S. state, logs `quantity` rounds or none.
- `unrankCourse`: the gap closes, rounds are kept, a Played course is unchanged.
- `moveCourse` places a Played course at 1, in the middle, at N+1 and past the end; Ranked moves are unchanged.
- Old operations without the option put a Played course at the bottom (`addCourse` at `rank`), and their `courses` never contain a null rank.
- `logRounds` with `addUnranked`: new course becomes Played, a Played course stays Played, a Ranked course keeps its rank; `courseAdded` true only for the new course.
- PR B: deleting the last round, and a zero count, keep the course in its state.
- `removeCourse` on a Played course; account deletion removes Played rows.
- Concurrent `markPlayed`, `moveCourse` and `unrankCourse` for one member (`Promise.all`) leave contiguous ranks.
- Played order is newest first and survives a renumber of the ranking.
- Reads: `memberRanking` and `publicRanking` are Ranked only (no Played course in the public ranking, ever); `memberList.unranked` for a friend; `coursePage` `onMyList`, `outOf` and `friendsUnranked`; `timelineRounds` `personalRank` null and the stand-in `rank`; profile stats count both; `topListDetail.onMyList` true for a Played course with no rounds; curation counts Played.
- Schema: several Played rows per member are allowed; the migrated column is nullable.

**API operation tests** (`createTestApp`, bodies parsed with the contract schemas): each new operation's shape and errors (`course_not_found`, `not_on_list`, `us_state_required`, `validation_failed`); every list-change response carries `unranked`; after a member has Played courses, every older operation's `courses` still parses with an integer rank; the anonymous public ranking leaves Played courses out. `contract.test.ts` covers 401 without a token, required fields and no polymorphism automatically.

**Web component tests**: the Played line (collapsed, opened, opens by itself when nothing is ranked), placement posts the right rank, the course page's three states, the Played button on rows and in the search dialog, ticks from `onMyList`.

**Browser tests** (`course-book.spec.ts`): one tap Played from a Top list row (no round in the database, tick, progress goes up); the Played line on Home and ranking a course from it, checked in the database order; the course page's Played it, Rank it and Take out of ranking; Log a round at a new course lands Played and Undo removes it; the existing "final-round removal" and timeline-delete scenarios change to "the course stays"; a friend sees the Played line; the public page leaves Played out; the zero-rounds member. Fixtures add Played rows inside these scenarios rather than to the shared baseline, so existing counts ("2 courses") don't move.

**Sample data**: `scripts/seed/personas.ts` gives some personas Played courses, and one a list with no rounds.

**Docs**: `docs/architecture.md` (schema table, data rules, migration rollback note, routes and Home), `AGENTS.md` data rules, `docs/api.md` (operation table, Undo note), `docs/testing.md` regression table (last-round delete keeps the course; ranks contiguous over Ranked; public ranking has no Played), the privacy page, and the decision record's Consequences (step 2 built; the contract word `unranked`; the `TimelineRound.rank` stand-in).

## 7. Open questions for the maintainer

1. **How does a member put a Played course into their ranking before "better or worse?" (#58) exists?** It can't land at the top or bottom by itself.
   - **(a) Tap the course it's better than.** Rank shows the whole ranking, the member taps the course it beats, and it lands just above. No typing, no long drag on a phone, and #58 ends the same way, so the screen survives #58. Moderate build.
   - **(b) Type a position**, like today's Move to… in the course details. Cheapest, but the member has to know that Pine Valley is #7.
   - **(c) Drag from the Played line into the ranking.** Familiar, but dragging past 50 courses on a phone is the frustration we're removing.
   - **Recommendation: (a).**
2. **Does the public page (`/r/<username>`) show Played courses?**
   - **(a) No: the ranking only, and its stats count Ranked courses.** Matches the decision's "only the ranking is public". A member's public Courses number will be lower than their profile's.
   - **(b) Yes: a collapsed Played line, and stats count everything.** Shows how much a member has played, but makes their whole list public.
   - **Recommendation: (a).** (b) can be added later as one field, without breaking anything.

Decided here, and open to a veto: Log a round at a new course adds it as Played; a course typed in by hand is added as Played without a round; marking Played takes a course off Want to play; a second tap on the Played button only undoes a Played course with no rounds; Played courses are listed most recent first; `ranked_at` waits for #54; the contract calls Played "unranked".

## 8. Build plan

Two pull requests. Sizes count tests: S under 100 lines, M 100 to 400, L over 400.

**PR A: the API (`feat/played-and-ranked`, this branch).** It deploys the API and a web build that behaves exactly as today. Merge it, check production (migration applied, `listMyCourses` carries `unranked: []`), then open PR B.

1. `docs(planning)`: this document.
2. `feat(domain)`: `placeInRanking` with data-driven tests. S
3. `feat(api)`: migration `0007`, `personal_rank` nullable, schema comments. S, its own commit.
4. `refactor(api)`: Ranked-only reads and renumbering over Ranked courses; the unranked list readers; course page, timeline, profile, top-list and curation counts as in section 5; `expectContiguousRanks`. M to L
5. `feat(api)`: `markPlayed`, `addPlayedCourse`, `unrankCourse`; `moveCourse` places Played courses; `logRounds` `addUnranked` and `courseAdded`; old operations rank a Played course at the bottom. Services and tests. M
6. `feat(api)`: contract: the new operations, schemas and fields, routes, API operation tests, `pnpm contract:emit`, and the web's generated types and mappers (no screen changes). M
7. `docs`: architecture, `AGENTS.md`, api.md and testing.md for the new state and the rollback rule. S

**PR B: the web, and the two rules old screens would trip over (`feat/played-and-ranked-web`, from `main` after PR A is live).**

1. `feat(api)`: deleting the last round or a zero count keeps the course. Held back from PR A because old screens' Undo would otherwise leave a course stuck at the bottom of the ranking for as long as PR A ran alone. S
2. `feat(web)`: one-tap Played on Top list rows, member lists, the course page and the search dialog; Log a round and Add a course land Played; Undo removes an added course. M
3. `feat(web)`: the Played line on Home and the own Ranking tab; ranking a Played course; Take out of ranking. M to L
4. `feat(web)`: friends see Played; ticks, progress and stats read the whole list; Timeline and Activity label Played rounds; the public page stays Ranked only; privacy text. M
5. `feat(seed)`: personas with Played courses and one with no rounds. S
6. `test(e2e)`: the browser scenarios in section 6. M
7. `docs`: routes, Home and the decision record. S

**Follow-up, tiny once PR B is in**: the product owner's "add courses from a friend's list" (2026-11-15) needs only `CourseActions` on the friend's ranking rows and their Played line (member lists get it in PR B already). It could ride in PR B as an eighth commit if the maintainer wants it there.

## What this leaves room for

- **#53**: its remaining criterion, the collapsed Played line, is built here.
- **#54**: `ranked_at` is set where `moveCourse` places or moves a course; `FeedItem.type` already allows a new value.
- **#55**: placing "next to B" in a filtered view is the same `moveCourse` call the placement mode makes.
- **#57**: first-run tapping is `markPlayed`, one locked request per tap returning the whole list. If tapping dozens of courses quickly ever feels slow, a batch operation can be added then.
- **#58**: "better or worse?" is a pure function over the Ranked order that ends in `moveCourse`; stopping halfway changes nothing, because the course is already Played.
