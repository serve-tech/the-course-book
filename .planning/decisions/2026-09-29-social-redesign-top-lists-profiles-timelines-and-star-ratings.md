# Social redesign: Top lists, profiles, timelines and star ratings

**Date:** 2026-09-29
**Status:** Accepted

## Context

[Friends-only visibility](2026-09-29-friends-only-visibility-with-mutual-friend-requests.md) shipped the friendship model: mutual request and accept, with only friends seeing each other's lists. An adversarial review of the result (local run of `main` at d9bb2b1; write-up with screenshots and research at https://claude.ai/artifact/MR8ByRScGoCAjiRyEze6qM) found:

- **No list of friends.** Friends are options in a `<select>`, and one page does four jobs: search, request inbox, picker and a friend's list. On a phone, a friend's page shows none of their content on the first screen.
- **Requests are invisible and uninformative.** Incoming requests only show on /friends (no badge) and carry no context. Finding someone requires already knowing their username.
- **Friends see almost nothing.** A friend's list has course, rank and `onMyList` only: no rounds, counts, dates or activity. "Remove friend…" is the loudest control on the page.
- **A round is only a date.** `score`, `tees` and `notes` exist on `rounds`, and the import fills them, but no operation reads or writes them.
- **"Add to my list" logs a round dated today** (`addToList`, used by Friends and Top 100). It exists because every played course needs a dated round.
- **Courses have no page.** Nothing gathers what friends think of a course.

The maintainer wants the social side to feel like Letterboxd, with a real profile for each person and a timeline of courses played for them and their friends. They are free to drop the current layout. What sets coursebook apart is the published consensus lists (Golf Digest World, USA and Public 100, the state lists, and Course Book's own Michigan Top 100): members work through them like a bucket list, can tick off courses outside them, and can make their own lists.

## Options Considered

1. **Fix the current Friends page in place** (badge, links, row detail)
   - Pros: small; keeps markup, element ids and browser tests.
   - Cons: keeps one page doing four jobs; there is still no profile, timeline or course page; rejected by the maintainer.
2. **Redesign around profiles, timelines and published lists as checklists** (Letterboxd structure, coursebook's look)
   - Pros: every finding above has a home; one design serves web, iOS and Android through the same API.
   - Cons: large; a new navigation and new element ids mean rewriting the browser tests; several schema and contract additions.

Sub-decisions, each by the maintainer on 2026-09-29:

- **Ratings.**
  - Options: a 0–10 score derived from rank (Beli, Grassy, Eden); stars on each round; stars plus a derived score; or the personal ranking plus an optional star rating per course.
  - Chosen: **the personal ranking plus an optional ½–5★ rating per course.** The two may disagree, as on Letterboxd.
- **Played without a date.** Chosen: the date is optional. Ticking a course off must never invent a round dated today.
- **What friends see.**
  - Always visible to friends: round dates, courses and counts.
  - Per round (Friends or Only me): score, tees and note. New rounds default to Friends; imported rounds with any of these fields default to Only me, because they were written when no one else could read them.
- **Finding friends.** Both an invite link and a QR code of it.
- **Feed history.** Imported history appears in feeds.
- **Member-made lists.** Visible to friends by default, with a per-list Only me toggle.
- **Names.** Profiles lead with the display name, username second. Screen names:
  - "Top lists" for the published lists;
  - "Lists" for lists members make;
  - "Want to play" for a member's own wishlist;
  - "Ranking" for the personal ranked list (today's My List);
  - "Timeline" for dated rounds.

## Decision

Option 2, following the review's proposal with the sub-decisions above. Rank-derived scores and sentiment buckets from the proposal are dropped in favor of star ratings.

- **Navigation.** Home (friends' activity), Courses (search, Top lists, course pages), Log, Friends (people, requests, invite) and Profile. Bottom tabs on phones, a top bar on desktop.
- **Profiles.** Every member, the viewer included, has a profile at `/<username>`: header, stats, Top Four (ranks 1–4), and tabs for Timeline, Ranking, Lists (Top list progress, Want to play, member lists) and Stats. A friend's profile adds how your ranks compare, the courses you both want to play, and Remove friend inside a ··· menu. Non-friends remain "not found".
- **Top lists as checklists.** Each published list shows the viewer's and friends' progress, and a course can be ticked off with an optional date.
- **Course pages** at `/courses/<id>` show:
  - the published ranks;
  - the viewer's rank, rating and play count;
  - friends who played it, with their rank as "#n of N" and their rating;
  - friends who want to play it;
  - friends' visible notes.
- **Rounds.** Rounds gain score, tees, a note, detail visibility and an optional date. Tagging playing partners comes later.
- **API first.** The API work lands as additive contract changes before the redesigned web client. iOS and Android use the same operations.

## Consequences

- **Design.** The API and data design is in [research/2026-09-29-social-api-design.md](../research/2026-09-29-social-api-design.md). Implementation lands in slices; none merges to `main` until the launch import has run and been verified, because the importer requires the deployed migration journal to match its checkout.
- **Contract exception.** Undated rounds make `Round.playedOn` nullable, which retypes a published field. The design argues for a one-time exception to the contract's growth-only rule, possible only because no native build has shipped yet. It needs the maintainer's approval before it merges.
- **Legacy behavior change.** "Add to my list" (Friends, Top 100) stops logging a round dated today. It becomes a tick-off with an optional date, or Want to play. This deliberately changes behavior carried over from the old app.
- **Web and tests.** The redesign replaces `legacy.css` markup and element ids. The browser tests are rewritten alongside it, and AGENTS.md's "preserve the existing markup" rule is lifted for this change.
- **Avatars.** Avatars need to know whether the member uploaded a photo. Clerk fills `image_url` with a generated placeholder even when they haven't (`hasImage` false). The design has the options: a session claim if Clerk offers one, otherwise the Backend API.
