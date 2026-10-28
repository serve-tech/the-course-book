# Progress-first preview Home

**Date:** 2026-10-27
**Status:** Accepted

Amends the Home and navigation parts of [Course-first Home and direct list navigation](2026-10-19-course-first-home-and-direct-list-navigation.md). The [opt-in layout preview](2026-10-19-opt-in-layout-preview-in-production.md) rollout is unchanged: Classic stays the default.

## Context

The maintainer's feedback on Classic Home: nothing on it draws you in; many things compete for attention. A UX review (local app, dev seed; write-up with screenshots, sources and a mockup at https://claude.ai/artifact/KaGUHupjqBkhMJC9AvVXW4) found:

- **Classic.** The largest type is a label ("Where your friends are playing"). About a dozen elements share the gold accent. Four placeholder tiles repeat the first four feed rows. Every row's loudest element is a friend's own rank. The only primary action sits in the sidebar beside two "Coming soon" cards. Nothing is about the member.
- **Course-first preview.** It is about the member, but its hero is a tagline and the brightest element is a filter tab. Home was the ranking editor: a tool for occasional reordering, with no focal point. Its "My lists" card described progress without showing it.

The guidance agrees: give a page one focal point and one recommended action (NN/g homepage and visual-hierarchy articles, Apple HIG Layout, Hick's law and the isolation effect). People speed up as a goal gets close (goal-gradient: Kivetz et al. 2006). A feed is only as good as the friends in it (Burke et al. 2009). The comparable apps that lead with a personal number plus the next action include GHIN (2026 redesign) and Duolingo. Letterboxd keeps its activity stream in its own tab.

The maintainer chose the full restructure over adding a hero above the existing editor.

**Same-day follow-up.** The maintainer raised two more questions.

*Should the hero default to the USA Top 100?*
- Only 15 of the USA Top 100 are also on the USA Public 100, so about 85 are private clubs.
- State lists hold 2 to 100 courses (average 23; Michigan's own list has 100).
- Goal-setting research says hard goals motivate only while people still believe they can reach them, and effort follows the share remaining (Locke & Latham 2002; Kivetz et al. 2006).
- Members persist more with goals they pick themselves (Patall et al. 2008 meta-analysis; the ENGAGE RCT).
- So: keep a reachable default and let members choose.

*Does the app now look bare?*
- First-impression research does not penalize simple pages; it penalizes clutter (Tuch et al. 2012; Reinecke et al. 2013).
- The real gaps are different:
  - Home offered one action;
  - course tiles and names lead nowhere, because there are no course pages;
  - six "Coming soon" cards announced missing features (one was wrong);
  - course tiles have no photos.
- The maintainer approved adding a lists strip with a choice, adding Up next, and removing the Coming soon cards.

## Options Considered

1. **Hero above the existing ranking editor.**
   - Pros: smallest change.
   - Cons: keeps a tool as Home; the page would still compete with itself.
2. **Progress-first Home (chosen).** The focal point is progress on one list. Then three friends' rounds noted from the member's side, then their top four linking to the editor.
   - Pros: one focal point that is personal and points to a next step. It reuses existing operations and components.
   - Cons: three reads instead of one. The editor is one tap away.
3. **Change Classic too, or make the new Home the default.**
   - Pros: everyone sees it.
   - Cons: changes production for every member without opt-in, against the rollout decision. Classic is expected to be retired, not improved.

## Decision

Option 2, in the course-first preview only.

- **Hero.** One published list's progress: count, bar and the friend with the most played on it. Log a round is the page's only solid gold action. The list is chosen by `chooseGoalList` (`features/home/goal-list.ts`), in this order:
  1. the member's pick: `?goal=<slug>`, else the slug saved under `coursebookHomeGoalList` on this browser;
  2. the home-state list, if started and unfinished;
  3. otherwise the unfinished started list with the largest share played (ties go to more played, then display order);
  4. otherwise the home-state list even if unstarted;
  5. otherwise the first list.
- **Your lists.** Under the hero, a strip of cards shows progress on every national list and the home state's, plus the tracked list if it is another state's (`goalChoices`). Tapping a card tracks that list. It is saved through `SafeStorage` and shown through `?goal=`, so a failed save still shows the pick and tells the member it won't be remembered. The pick is per browser; an account-level goal would need an additive API field. On phones the strip scrolls sideways.
- **Up next.** The tracked list's first three unplayed courses, Want to play first (`upNext`). They use the Courses page's `CourseRow` and `CourseActions`, so members can save Want to play or log from Home; the Log dialog opens in place. "See the list" opens `/courses?list=<slug>`. A finished list says so and points to the strip.
- **Friend comparison.** Shown as company ("Dan Whitaker has played 20"), not as a gap. Strava's 2024 Weekly Snapshot drew complaints for making comparisons feel like failure.
- **Friends' rounds.** Three at distinct courses, from `newFromFriends`, which skips backfills. The note is "Your #n" when the course is on the member's list, else the course's first published rank (`friendNote`). It never says "not played": the match is by course id, and the API resolves equivalent course rows on some reads.
- **Top four.** Reuses `TopFour`, with a "Your ranking" link to `/u/:username/ranking`. The full editor and its `?log=1` dialog live there.
- **Navigation.**
  - Desktop: Home, My ranking, My lists, Courses, Activity, Friends.
  - Phones: Home, My ranking, Log a round, Courses, Friends. That is five slots. Home links to Activity and to the member's lists, so those two are desktop-only.
  - All six desktop links fit at the 901px breakpoint.
- **Log links.** `/?log=1` redirects to the own-profile Ranking dialog in both layouts. *Superseded 2026-10-28: Log a round opens over the current page ([decision](2026-10-28-log-a-round-opens-over-the-current-page.md)).*
- **Coming soon cards removed app-wide:** Activity and Classic Home's sidebar, the Profile timeline, Stats, and member Lists. This also changes Classic.
- **Reads.** Home reads `/v1/top-lists`, then the tracked list's detail (`/v1/top-lists/{type}/{scope}`), alongside the newest 12 feed items and `/v1/me/courses`. There are no API, contract, schema, auth or infrastructure changes.

## Consequences

- **Superseded.** The course-first decision's "the editable ranking is Home" and its "Home reads only `/v1/me/courses`" no longer hold for the preview.
- **Request cost.** Home makes four reads in two round trips (the list detail waits for the standings) where the old preview made one and Classic makes two, on top of the shell's two. Changing the tracked list reloads Home's reads. Loading delays reported on 19 Oct are still unexplained. Measure with the loading telemetry (PR #46) once it ships. If Home is slow, an additive `/v1/home` summary operation is the contract-safe fallback.
- **Classic otherwise unchanged.** It keeps the review's other findings (gold everywhere, duplicated strip). Promoting the preview and retiring Classic, its control and the preference together remains the plan.
- **Browser tests.** Shared journeys now edit the ranking on the profile in both layouts.
  - One preview journey covers the hero, the friends' notes, the top four, See the list, Your ranking, All activity and `/?log=1`.
  - Another covers Up next's Want to play and Log, and tracking another list, including after a reload.
- **Not done; separate decisions:**
  - syncing the tracked list across devices (an account field);
  - a production read of how many members have played any USA Top 100 course versus their state list (needs explicit authorization);
  - course photography in the hero (rights and attribution, per the course-first decision);
  - milestone moments instead of streaks;
  - course pages, so tiles and course names lead somewhere (designed in the 2026-09-29 redesign).
