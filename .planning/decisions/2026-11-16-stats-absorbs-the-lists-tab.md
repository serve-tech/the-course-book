# Stats absorbs the Lists tab

**Date:** 2026-11-16
**Status:** Accepted

## Context

The product owner asked that the "8 states" on a profile's Stats say which states (#71), and the maintainer wanted Stats to be more interesting, because the owners liked it most. The first version (PR #79 as first opened) added a list of states with course counts and the four Top 100 counts.

Reviewing it on screen, the maintainer saw that Stats and the Lists tab now showed the same things twice. Lists had the four Top 100s and "Best in Michigan 13 / 100" as progress bars; Stats had the same four lists as bare counts and "Michigan 14" as a count. The headline numbers linked down the page to their own breakdown, which the maintainer called worthless. Neither tab tied back to anything.

Three further findings came out of the review:

- "Michigan · 14 courses" beside "13 / 100" read as a bug. Both numbers were right: 14 courses played in Michigan, 13 of them on Best in Michigan (Tullymore is on the USA Public list but not the state's). Unlabelled, they look like a contradiction.
- A member has four Top 100s but may have fifty states. Two columns side by side, one for each, would leave about 4,000 px of empty space beside the states and push everything under them out of reach.
- The states and countries counts belong with the other counts in the profile header, not in a block of their own on one tab.

## Options Considered

1. **Keep both tabs and delete the duplicates from Stats**
   - Pros: smallest change.
   - Cons: the states still appear on both tabs in two forms; Stats is left with little.
2. **Fold list progress into Stats; Want to play becomes its own tab (chosen)**
   - Pros: one place answers "which states?" and "how far through each list?"; every row opens a real list; Want to play is a list of courses, not a stat, and matters more once rows carry Played and Want to play buttons (#52).
   - Cons: a tab is renamed away, so old links need a redirect; Stats needs the published entries, one more (cached) request.
3. **Keep Lists and drop Stats**
   - Pros: one tab fewer.
   - Cons: Stats is the tab the owners liked most.

For the layout:

1. **Two columns, Top 100s beside States**: balanced only while a member has about four states.
2. **Main column and a sidebar**: the long list buries the short sections on a phone, and a short main column beside a long sidebar looks as wrong the other way.
3. **Full-width bands, rows two across, long lists capped (chosen)**: each band's height is its own; a summary page shows the first few and offers the rest.

## Decision

- **Tabs:** Ranking, Stats, Want to play, Timeline. `/u/<username>/lists` redirects to Stats. A list's page (`/u/<username>/lists/usa`) keeps Stats current and links back to it.
- **Header:** Rounds, Courses, In `<year>`, States, Countries, Friends, in that order (maintainer, 2026-11-16), each label agreeing with its number. It is crowded until Rounds and "In `<year>`" are retired, which the maintainer accepts.
- **Stats bands, in order:** Top 100s; States; Countries (when more than one); then "Your ranking vs the lists" beside "The best you've played".
- **A state row** gives the courses played there and says in words how many of them its list holds: "13 of your 14 are on Best in Michigan (100 courses)".
- **Every row names the member's top-ranked course** on that list or in that place (maintainer: it applies to every list on the page). Its name opens the course page; the rest of a list's row opens the list.
- **States and Countries show six**, then a "Show all" button; a list at most two longer shows whole.
- **Hidden gem always picks a course when it can** (maintainer: it must show even when every course is on a list): the top-ranked course on no national list when it is in the top half of the ranking; else the course a list puts furthest below where the member does; else that off-the-national-lists course wherever it sits.
- **Biggest disagreement:** the widest gap between a list's order and the member's among their courses on it, over lists holding at least three; never the gem's course.
- **Not built:** "closest to finishing" (the bars already say it), "Most played" (rounds are being retired), and a friends comparison on Stats (not asked for yet).

## Consequences

- No API, contract or database change. `profileStats(rows, entries)` in the web's `features/social/stats.ts` is the one rule; the shared domain package's `topListProgress` is removed, since Stats was its only caller.
- Later lines (architects #75, favourite holes #76) are new bands.
- When Played and Ranked (#52) ships its screens, Stats should count Played courses too; today it counts the ranking.
- The comparison card (courses in common, agreement, biggest split) still lives beside Timeline. When Timeline is retired it needs a home, and a friend's Stats is the likely one.
- The Timeline tab's sidebar still shows the four Top 100s. It goes when Timeline does.
