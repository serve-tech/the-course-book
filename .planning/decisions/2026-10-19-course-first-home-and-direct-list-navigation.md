# Course-first Home and direct list navigation

**Date:** 2026-10-19
**Status:** Accepted

**Rollout amendment:** [Opt-in layout preview](2026-10-19-opt-in-layout-preview-in-production.md) keeps Classic as the production default until the maintainer promotes this design. It also retains own-profile destinations for shared Log links; only the preview Home's Log action uses `/?log=1`.

## Context

The product owner's feedback, endorsed by the maintainer, is that courses and the member's personal ranking are the app's core. The social feed is useful, but leading with it hid the ranking behind Profile → Ranking and list progress behind Profile → Lists. The maintainer requested a homepage redesign and less friction reaching these features.

## Options Considered

1. **Keep the feed first and add shortcuts.** Small change, but the member's main task remains another navigation away.
2. **A dashboard with ranking previews.** Shows multiple features, but still needs a second step to edit the full ranking and adds another presentation of the same data.
3. **Make the editable ranking Home, with direct list navigation.** Opens the core task immediately and reuses the existing editor; moves social activity to its own destination.

## Decision

Use option 3. This supersedes only the navigation/Home portion of the 2026-09-29 social-redesign decision.

- `/` shows the full editable personal ranking, Log a round, a My lists shortcut and published-list discovery links. Signed-out visitors keep the course-focused welcome.
- `/activity` preserves the friends feed and its pagination and empty states.
- Desktop and mobile navigation use the same order: My ranking, My lists, Courses, Activity, Friends. My lists links straight to the existing own-profile Lists tab. Profile stays accessible from the account menu.
- Global Log links open `/?log=1`. Existing profile Ranking URLs and their `?log=1` deep links continue to work through the same editor.
- Home reads only `/v1/me/courses` for its content. It does not depend on feed, friends or profile requests. Existing shell identity and request-badge loading remain.

## Consequences

- No schema, API contract, stored rank semantics, privacy rules, infrastructure or authentication changes.
- One shared editor and Log-link wrapper serve Home and the own-profile Ranking tab. Mutations still use `/journal` and loader revalidation.
- Browser regressions cover signing into the ranking, logging and reordering from Home, direct list navigation, published-list shortcuts, and the relocated feed on desktop and mobile.
- Course photography is a follow-up, not a prerequisite for navigation. The catalog currently has limited logo URLs, but no course-photo or attribution model. Start with a curated set of correctly identified, course-approved or appropriately licensed images, optimized sizes and a fallback; retain source, creator, permission/license and attribution. Member uploads would additionally require upload validation and a moderation/removal workflow.
- Hosting options can be evaluated when photos are ready; no storage provider is selected. A small curated pilot can ship as static assets without an upload service. Wikimedia Commons requires reviewing each file's license and attribution requirements ([official reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia)).
