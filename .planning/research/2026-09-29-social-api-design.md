# Social API and data design

**Date:** 2026-09-29
**Decision:** [Social redesign: Top lists, profiles, timelines and star ratings](../decisions/2026-09-29-social-redesign-top-lists-profiles-timelines-and-star-ratings.md)
**Spec (UI):** https://claude.ai/artifact/MR8ByRScGoCAjiRyEze6qM, amended by the decision's sub-decisions: star ratings replace the rank-derived score and sentiment buckets.

This is the API-first plan: the schema, contract and service rules the redesigned web client and the native apps will share. Migrations are forward-only and the contract only grows, so both are designed here once, then landed in slices (end of file). Nothing merges to `main` until the launch import has run and been verified.

## Principles carried over

- Every mutation is one transaction under the acting member's lock (`withJournalLock`), keyed on the verified session's user. Pair operations take both members' locks.
- Reads that expose another member go through one check: the subject is the viewer or an accepted friend; anyone else is 404 `member_not_found`, indistinguishable from a missing username.
- Play count stays `count(rounds)`. A course on the list always has at least one round; deleting the last round still removes it.
- Contract rules (contract/README.md): named schemas, response fields always present (`null` for none), `.nullish()` request fields, documented strings for open value sets, additive only. One exception is proposed below.
- Pure logic lives in `packages/domain` (comparison, cursors, titles, reserved names, rating conversion) and is tested directly; services are tested against the local Postgres; routes through `createTestApp`.

## Schema changes

| Migration | Change | Notes |
|---|---|---|
| 0005 rounds and ratings | `rounds.played_at` drops NOT NULL (default stays `CURRENT_DATE`) | NULL means "date unknown". |
| | `rounds.details_visibility` enum `round_visibility('friends','private')` NOT NULL default `'friends'` | Custom SQL backfill: `'private'` where `score`, `tees` or `notes` is not null. Only imported rounds have details, so this hides exactly what was written in private. |
| | `user_courses.rating smallint` NULL, check 1–10; `user_courses.rated_at timestamptz` NULL | Half stars: 7 = ★★★½. The contract carries 0.5–5.0. |
| 0004 want to play | `want_to_play(user_id → users cascade, course_id → courses cascade, created_at)`, PK `(user_id, course_id)` | |
| 0006 member lists | `lists(id uuid, owner_id → users cascade, title text, description text NULL, ranked bool, visibility list_visibility('friends','private'), created_at, updated_at)` | Title 1–100 chars (check). |
| | `list_courses(list_id → lists cascade, course_id → courses cascade, position int > 0, note text NULL, created_at)`, PK `(list_id, course_id)` | Unique `(list_id, position)` DEFERRABLE, in custom SQL like 0002. Positions are contiguous 1..N and reuse `reorder()`/`insertAt()`. |
| 0007 invites | `invites(id uuid, inviter_id → users cascade, token_hash text unique, created_at, expires_at, redeemed_by → users set null, redeemed_at)` | Token: 32 random bytes, base64url; only its SHA-256 is stored. Single use, 7-day expiry. |
| | `friendships.source text` NULL (`'invite'`) | Gives a request its context. |
| later: played with | `round_players(round_id → rounds cascade, member_id → users cascade)`, PK both | Friends only, checked at write time. |

All are backward-compatible with the release still serving during a deploy: new tables, new nullable columns, a dropped NOT NULL. The old release never writes NULL dates and ignores new columns.

**Account deletion.** A deleted account's `users` row is a tombstone, so cascades don't fire. `deleteAccountData` must also delete the member's `want_to_play`, `lists` (items cascade), `invites` and `round_players` rows. The regression test asserts that no row references the member afterwards.

## Contract

### Changed shared schemas (additive except where marked)

- `Member` + `avatarUrl: string|null`. It is non-null only when the member uploaded a photo (see Avatars).
- `Me` + `incomingRequests: int`, which drives the nav badge.
- **`Round.playedOn` becomes nullable (exception).** It also gains `score: int|null`, `tees: string|null`, `note: string|null` and `visibility: string` (`friends`, `private`; may grow). For a friend viewing a round with `private` details, `score`, `tees` and `note` are null.
- `MyCourse` + `rating: number|null` (0.5–5.0 in 0.5 steps).
- `MemberCourse` (a friend's ranking row):
  - `rating: number|null`
  - `played: int`
  - `lastPlayedOn: date|null`
  - `myRank: int|null`, the viewer's rank for the same course, so the UI can show "You #2".
- `LoggedRounds`, `AddedCourse` and `AddedToList` + `roundIds: uuid[]`, so the client can open or edit the new rounds.
- `FriendRequests` + `requests: FriendRequest[]`. `FriendRequest` is `{member, direction: "incoming"|"outgoing", mutualFriends: int, viaInvite: bool, sentAt: datetime}`. `incoming` and `outgoing` stay for old clients.

**Why the exception.** Undated rounds cannot be represented in a required `playedOn` without inventing a date. That invented date is the bug being fixed. The growth-only rule protects installed app builds, and none exist yet: the web client is regenerated from the contract in the same change. The alternatives are:

- a membership with zero rounds, which breaks "play count = rounds" and "the last round removes the course";
- a sentinel date, which is a lie in the data;
- a `/v2` just for this, which is disproportionate.

Record in contract/README.md that this was the last retype before native builds ship. **Approved by the maintainer on 2026-09-29.**

### Changed request schemas

- `LogRoundsRequest`, `AddCourseRequest` and `AddToListRequest` gain the same nullish round-detail fields:
  - `undated: bool` (true logs with no date; `playedOn` must then be absent)
  - `score: int` 18–200
  - `tees: string` ≤ 40
  - `note: string` ≤ 2,000
  - `visibility: enum friends|private` (default friends)
  - `rating: number` 0.5–5.0, step 0.5 (sets the course rating)

  Score, tees and note with `quantity` > 1 is 400 `validation_failed`.
- `addToList` (Friends, Top lists "Played it"): an omitted `playedOn` now means **undated**, not today. The current web client always sends a date, so nothing breaks. The redesigned client stops sending one.
- `logRounds` and `addCourse` keep "today when omitted", since the Log dialog always has a date field.
- Logging or adding a course removes it from Want to play in the same transaction.

### New operations

| operationId | Method and path | Response | Rule |
|---|---|---|---|
| `updateRound` | PUT `/v1/me/rounds/{roundId}` | `Round` | Full replacement of `playedOn`, `score`, `tees`, `note`, `visibility` (missing = null; missing `playedOn` = undated). 404 `round_not_found`. |
| `setRating` | PUT `/v1/me/courses/{courseId}/rating` | `RatedCourse {rating, courses}` | `rating` null clears. Course must be on the list: 404 `not_on_list`. Sets `rated_at`. |
| `getMemberProfile` | GET `/v1/members/{username}/profile` | `Profile` | Self or friend. |
| `listMemberRounds` | GET `/v1/members/{username}/rounds?cursor&limit` | `Timeline {rounds: TimelineRound[], nextCursor}` | The timeline, newest first, undated last. |
| `getCourse` | GET `/v1/courses/{courseId}` | `CoursePage` | The course page. 404 `course_not_found`. |
| `listTopLists` | GET `/v1/top-lists` | `TopLists {lists: TopListProgress[]}` | Every published list with the viewer's and each friend's count. |
| `getTopList` | GET `/v1/top-lists/{type}/{scope}` | `TopListDetail {progress, entries: TopListEntry[]}` | The checklist. 404 `top_list_not_found` (new code). |
| `listWantToPlay` | GET `/v1/members/{username}/want-to-play` | `WantToPlay {courses: WantToPlayEntry[]}` | Self or friend, newest first. |
| `addWantToPlay` / `removeWantToPlay` | PUT / DELETE `/v1/me/want-to-play/{courseId}` | `WantToPlay` (own) | Idempotent. Allowed for courses already played ("play it again"). |
| `listMemberLists` | GET `/v1/members/{username}/lists` | `CourseLists {lists: CourseListSummary[]}` | A friend sees only `friends` lists. |
| `getCourseList` | GET `/v1/lists/{listId}` | `CourseListDetail` | Owner, or a friend when visible; otherwise 404 `list_not_found` (new code). |
| `createCourseList` | POST `/v1/me/lists` | `CourseListDetail` | `CourseListRequest {title, description?, ranked?, visibility?}` |
| `updateCourseList` | PUT `/v1/me/lists/{listId}` | `CourseListDetail` | Full replacement of the metadata. |
| `deleteCourseList` | DELETE `/v1/me/lists/{listId}` | 204 | |
| `addToCourseList` | PUT `/v1/me/lists/{listId}/courses/{courseId}` | `CourseListDetail` | Adds at the bottom; idempotent; body `{note?}` updates the note. |
| `removeFromCourseList` | DELETE `/v1/me/lists/{listId}/courses/{courseId}` | `CourseListDetail` | Renumbers. |
| `moveInCourseList` | PUT `/v1/me/lists/{listId}/courses/{courseId}/position` | `CourseListDetail` | `reorder()`. |
| `createInvite` | POST `/v1/me/invites` | `Invite {url, expiresAt}` | The web renders the QR code from `url` client-side; no vendor. |
| `redeemInvite` | POST `/v1/invites/{token}` | `MemberRelationship` | Signed-in invitee. Creates a pending request invitee → inviter with `source = 'invite'`, or accepts one the inviter already sent. Expired or used: 404 `invite_not_found` (new code). Redeeming your own invite is 400. |
| `getFeed` | GET `/v1/feed?cursor&limit` | `Feed {items: FeedItem[], nextCursor}` | See Feed. |

### New schemas

- `Profile`:
  - `member: Member`
  - `relationship: string` (`self`, `friends`)
  - `friendsSince: date|null`
  - `stats: ProfileStats`
  - `topFour: MemberCourse[]` (ranks 1–4)
  - `comparison: Comparison|null` (null for self)
- `ProfileStats`: `{courses, rounds, roundsThisYear, friends, wantToPlay, lists}`, all ints. "This year" is the UTC year of `played_at`.
- `Comparison`:
  - `inCommon: int`
  - `agreement: number|null`, 0–1: the share of concordant pairs over shared courses, null when fewer than 3 are shared
  - `biggestSplit: Split|null`
- `Split`: `{course, theirRank, myRank}`, the shared course whose percentile positions (rank/N) differ most. Ties go to the higher combined position, then the course id.
- `TimelineRound`:
  - the `Round` fields
  - `course: Course`
  - `visit: int` (1 = first round at that course; undated rounds count as earliest)
  - `rating: number|null` (the member's current rating of the course)
  - `players: Member[]`, empty until "played with" ships
- `CoursePage`:
  - `course: Course`
  - `you: CourseStatus`, which is `{rank|null, listSize, rating|null, played, wantToPlay}`
  - `friendsPlayed: FriendOnCourse[]`, where `FriendOnCourse` is `{member, rank, listSize, rating|null, played, lastPlayedOn|null}`
  - `friendsWantToPlay: Member[]`
  - `friendsRating: number|null` (average), `friendsRatingCount: int`
  - `notes: CourseNote[]`, where `CourseNote` is `{member, roundId, playedOn|null, note, score|null}`, newest 20 visible notes
- Top lists:
  - `TopList`: `{type, scope, title, source, year, size}`. `title` comes from the pure `topListTitle()`: "World Top 100", "USA Top 100", "USA Public Top 100", or "Best in Florida" for a state.
  - `TopListProgress`: `{list: TopList, mine: int, friends: MemberProgress[]}`, where `MemberProgress` is `{member, played}`, highest first.
  - `TopListEntry`: `{course, rank, played: int, wantToPlay: bool, friendsPlayed: Member[]}`
- Want to play:
  - `WantToPlayEntry`: `{course, addedAt, you: CourseStatus, friendsPlayed: FriendOnCourse[], friendsWantToPlay: Member[]}`, where the friend lists exclude the subject
- Member lists:
  - `CourseListSummary`: `{id, owner: Member, title, description|null, ranked, visibility, size, played (the viewer's played count), updatedAt}`
  - `CourseListItem`: `{course, position, note|null, played: int (the viewer's)}`
- `FeedItem`:
  - `id: string`
  - `type: string`: `round`, `backfill`, `rating`, `want_to_play`, `list_course`, `friendship`; may grow
  - `at: datetime`
  - `member: Member`
  - `course: Course|null`
  - `round: Round|null`
  - `rating: number|null`
  - `list: CourseListSummary|null`
  - `count: int|null`
  - `milestone: TopListMilestone|null`, where `TopListMilestone` is `{list: TopList, played}` ("Dan's 27th of the USA Top 100")

### Rules worth stating

- **Timeline order.** `played_at DESC NULLS LAST, created_at DESC, id DESC`. Postgres puts NULLs first in DESC by default, so NULLS LAST is explicit. The cursor is opaque base64url JSON `{p, c, i}`, parsed with Zod; a bad cursor is 400. The keyset condition across the null boundary is the riskiest code here and gets data-driven tests at every page boundary.
- **Visibility.**
  - Friends always see round dates, courses, counts, ratings, Want to play and `friends` lists.
  - Score, tees and note follow the round's visibility; the owner always sees everything.
  - Only `friends`-visible notes appear on course pages and in the feed.
- **Top lists progress** counts the courses on the member's list by id. Duplicate catalog rows (known from the import) count separately, the same as the Rankings page today.
- **Feed.** It is derived on read from:
  - rounds (`created_at`)
  - ratings (`rated_at`)
  - Want to play (`created_at`)
  - list items of visible lists
  - accepted friendships

  Covering the viewer and their friends. Imported history is included.
  - **Backfill:** rounds logged more than 14 days after `played_at` (or undated) collapse into one `backfill` item per member and day, with `count`. This follows Letterboxd's backfill throttle; importing 60 old rounds must not flood friends.
  - **Milestone:** a round that is the member's first at a course on a Top list carries `milestone`.
  - **Rank moves** are not in the feed; recording them needs an event table, deferred.
- **Member search** matches username or display name, 3+ characters. This widens discovery slightly, as the review asked ("Kowalski" finds nobody today). Results still carry only the public projection.
- **Profile URLs and reserved usernames.** Profiles live at `/u/<username>` (maintainer, 2026-09-29), so route words never collide with usernames.
  - A short reserved list still blocks impersonation and confusion for **new** accounts: admin, administrator, support, help, coursebook, coursebookgolf, official, staff, moderator, and anything starting with `deleted_`, the tombstone prefix.
  - The check runs only when a `users` row is created or its username changes. It never runs on the per-request refresh, so an existing member with such a name is never locked out.
  - Clerk's sign-up form must show the same rule. Check whether Clerk can restrict usernames itself; otherwise the 403 `username_invalid` message must name the rule.
- **Avatars.**
  - Store the image only when Clerk says the member uploaded one. The Backend API user has `hasImage`, which the dev instance confirms is false with a placeholder `imageUrl`.
  - Clerk's JWT-template docs list `{{user.image_url}}` but no `has_image` shortcode. Before building this, check the dashboard's claims editor.
    - If a `has_image` claim exists, add it to the session template on both instances (maintainer action) and read it in `identityFromClaims`.
    - If not, drop `image_url` from the claims path and set `avatarUrl` from the Backend API user. That lookup is cached per member like provisioning, not made per request.
  - Without a confirmed image, the client shows monograms. Stored placeholder URLs self-correct on each member's next provisioning.

## Slices (one PR each, in order)

1. **Rounds and ratings.**
   - Scope: migration 0005 (Want to play shipped first as 0004, 2026-09-30); `Round` fields and the nullable date; round-detail request fields; `updateRound`; `setRating`; `rating` on `MyCourse`/`MemberCourse`; `roundIds`.
   - Web keeps working: mappers accept a null date ("Date unknown" in round history).
   - Fixes the review's high-severity bug: the Friends and Top 100 buttons stop sending today's date.
2. **Want to play and Top lists.** Migration 0004 (shipped before slice 1 at the maintainer's request, 2026-09-30); Want to play operations; `listTopLists`; `getTopList`; `topListTitle()`; removal from Want to play on log.
3. **Profiles, timelines, course pages.**
   - Operations: `getMemberProfile`, `listMemberRounds`, `getCourse`; `MemberCourse.played`, `lastPlayedOn`, `myRank`.
   - Pure functions: `compareRankings()`, the timeline cursor, visit numbering.
   - `Member.avatarUrl` (required by the maintainer), from a confirmed uploaded photo only.
4. **Member lists.** Migration 0006 and the list operations.
5. **Friends plumbing.** `Me.incomingRequests`; `FriendRequests.requests` with context; display-name search; reserved usernames for new accounts; migration 0007 and invites.
6. **Feed.** `getFeed`.
7. **Web redesign** (planned separately once 1–6 exist):
   - Navigation.
   - Routes: `/`, `/courses`, `/courses/:id`, `/top-lists/:type/:scope`, `/friends`, `/invite/:token`, `/u/:username` and its tabs, `/lists/:id`, `/account`, `/privacy`.
   - Redirects from `/top-100` and `/friends/:username` (to `/u/:username`).
   - Log a round with stars.
   - Browser tests rewritten.
   - `AGENTS.md` updated to drop "preserve legacy markup".
8. **Later.** Played with; the QR code on the Friends page (uses `createInvite`); taste stats; a year in golf.

Every slice runs lint, typecheck, unit and database tests, `contract:check` and the browser suite. Each updates `docs/architecture.md` (data rules) in the same change, and `contract/README.md` where the contract rules are touched.
