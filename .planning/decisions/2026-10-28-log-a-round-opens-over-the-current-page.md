# Log a round opens over the current page

**Date:** 2026-10-28
**Status:** Accepted

Amends the Log links in [Progress-first preview Home](2026-10-27-progress-first-preview-home.md) and the shared Log destinations in [Opt-in layout preview](2026-10-19-opt-in-layout-preview-in-production.md) and [Course-first Home](2026-10-19-course-first-home-and-direct-list-navigation.md).

## Context

The maintainer's feedback: clicking Log a round on Home opened the dialog but moved them to their profile, which is "an incredibly confusing pattern for a user."

The general Log a round buttons opened the dialog by navigating to `/u/<me>/ranking?log=1`:
- Home's hero, the phone tab bar, the Activity and Classic Home card, and the profile header all did this.
- The reason: the course search dialog and its hand-entered course step lived inside the ranking editor (`MyRanking`). The links went to the editor rather than moving the dialog out of it.
- Course rows elsewhere (Courses, Up next, member lists) already opened `LogRoundDialog` in place for one course.

## Options Considered

1. **The layout owns one Log dialog that any page opens (chosen).**
   - Pros:
     - One dialog and one wiring path.
     - Works on every page, including the tab bar's Log.
     - Nothing navigates.
   - Cons:
     - The layout does not load the member's ranking. The dialog reads `/v1/me/courses` when it opens for its "Already played" note: one extra read per open.
2. **Each page renders its own search dialog.**
   - Pros: no new shell service.
   - Cons:
     - Repeats the dialog and its add-course step on every page with a Log button.
     - The tab bar would still need a page-independent dialog.
3. **Keep the redirect and explain it.**
   - Cons: keeps the confusing move.

## Decision

Option 1.
- **Opening it.** `Shell.openLog()` opens `LogRound` (`features/rounds/LogRound.tsx`) over the current page: course search, then the hand-entered course dialog. Signed out, it opens sign-in. Like the account dialog, it closes if the member navigates away.
- **Buttons.** All general Log a round buttons call it:
  - Home's hero;
  - the navigation's Log item, which has no URL;
  - the Activity and Classic Home card;
  - the profile header;
  - the empty ranking's Log your first round.
- **Updating the page.** After a log, the `/journal` action revalidates the page underneath. Home's progress, Up next and the ranking update in place.
- **Old links.** `?log=1` on any page opens the dialog over that page, and the layout removes the parameter. Saved links keep working. Home no longer redirects, and `logPath` is gone.
- **Play counts.** The "Already played N×" note uses `/v1/me/courses`, read when the dialog opens. If that read fails, it is logged and the dialog works without the note.

## Consequences

- No API, contract or schema change.
- Logging from Home or Activity no longer lands on the profile. The ranking editor keeps drag, details, round history and counts, but no longer has its own Log or Add dialogs.
- Browser tests check that Log stays on Activity, on Courses (tab bar, phones), on Classic Home, and on `/?log=1`.
