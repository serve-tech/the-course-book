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

- **Hero.** One published list's progress: count, bar and the friend with the most played on it. Log a round is the page's only solid gold action; See the list opens `/courses?list=<slug>`. The list is chosen by `chooseGoalList` (`features/home/goal-list.ts`), in this order:
  1. the home-state list, if started and unfinished;
  2. otherwise the unfinished started list with the largest share played (ties go to more played, then display order);
  3. otherwise the home-state list even if unstarted;
  4. otherwise the first list.
- **Friend comparison.** Shown as company ("Dan Whitaker has played 20"), not as a gap. Strava's 2024 Weekly Snapshot drew complaints for making comparisons feel like failure.
- **Friends' rounds.** Three at distinct courses, from `newFromFriends`, which skips backfills. The note is "Your #n" when the course is on the member's list, else the course's first published rank (`friendNote`). It never says "not played": the match is by course id, and the API resolves equivalent course rows on some reads.
- **Top four.** Reuses `TopFour`, with a "Your ranking" link to `/u/:username/ranking`. The full editor and its `?log=1` dialog live there.
- **Navigation.**
  - Desktop: Home, My ranking, My lists, Courses, Activity, Friends.
  - Phones: Home, My ranking, Log a round, Courses, Friends. That is five slots. Home links to Activity and to the member's lists, so those two are desktop-only.
  - All six desktop links fit at the 901px breakpoint.
- **Log links.** `/?log=1` redirects to the own-profile Ranking dialog in both layouts.
- **Reads.** Home reads `/v1/top-lists`, the newest 12 feed items and `/v1/me/courses` in parallel. There are no API, contract, schema, auth or infrastructure changes.

## Consequences

- **Superseded.** The course-first decision's "the editable ranking is Home" and its "Home reads only `/v1/me/courses`" no longer hold for the preview.
- **Request cost.** Home makes three parallel reads where the old preview made one and Classic makes two, on top of the shell's two. Loading delays reported on 19 Oct are still unexplained. Measure with the loading telemetry (PR #46) once it ships. If Home is slow, an additive `/v1/home` summary operation is the contract-safe fallback.
- **Classic unchanged.** It keeps the review's findings (Coming soon cards, gold everywhere, duplicated strip). Promoting the preview and retiring Classic, its control and the preference together remains the plan.
- **Browser tests.** Shared journeys now edit the ranking on the profile in both layouts. A preview journey covers the hero, the friends' notes, the top four, See the list, Your ranking, All activity and `/?log=1`.
- **Not done; separate decisions:**
  - letting members pick a goal list (an account field);
  - course photography in the hero (rights and attribution, per the course-first decision);
  - milestone moments instead of streaks;
  - the out-of-date "Want to play, Coming soon" card on Profile.
