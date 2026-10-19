# Opt-in layout preview in production

**Date:** 2026-10-19
**Status:** Accepted

## Context

After reviewing the course-first homepage, the maintainer asked to deploy it while letting members compare old and new layouts. They corrected the initial URL-switch proposal: ordinary users need an in-app control. There is no staging/QA environment, and the app remains one static frontend and one API.

## Options Considered

1. **Query-string override.** Useful to developers, but not discoverable or convenient for members.
2. **Per-browser opt-in with both layouts in the frontend.** Small, reversible and uses existing browser-preference rules. No account schema or external dependency; selection does not sync between devices.
3. **Managed remote flags.** Supports targeted cohorts, percentage rollouts and a central shutoff without rebuilding, but adds configuration, SDK and operational overhead for one presentation change.
4. **Blue/green environments.** Supports deployment traffic switching, but requires separate deployed versions and does not itself provide a member-facing preference.

## Decision

Use option 2 for this temporary rollout. This amends the default-release policy and shared Log destinations in the [course-first Home decision](2026-10-19-course-first-home-and-direct-list-navigation.md).

- Classic remains the default: friends feed on Home; Home, Courses, Friends, Profile navigation, plus the mobile Log action.
- A visible preview strip below the header offers **Try the new layout** and **Use classic layout** on desktop and mobile. The choice changes both Home and navigation. No URL editing is required.
- Store only `classic` or `course-first` under `coursebookLayoutPreview` using `SafeStorage`. Unknown/unavailable preferences fall back to Classic. A failed write is logged and shown to the member; it never reports success.
- Route loaders read the preference. The control saves it and revalidates loaders, switching the shell and page content together without a full browser reload. Storage events revalidate other open tabs. Selection is per browser, not per account, and clearing site data resets it.
- Both layouts use the same API and the same real account data. This is a production preview, not a sandbox: round logging, ranking edits and deletion remain real operations. Existing local and CI tests remain required.
- `LAYOUT_PREVIEW_ENABLED` in `apps/web/app/features/shell/layout-preview.ts` is the single build-time shutoff. Setting it false and deploying hides the control and forces Classic even for opted-in browsers when they load the updated build; already-open tabs need a refresh. It is not an instant remote flag and does not protect unrelated shared code changes.
- No storage service, API/configuration variables, schema, authentication, infrastructure or deployment pipeline changes. This task updates PR #45; merge/deploy requires the maintainer's separate instruction.

## Consequences

- Test both navigation variants, Classic and preview loading, live edits carried between layouts, refresh persistence, switch-back, cross-tab consistency, and storage failure. Keep these checks while the preview exists.
- The existing own-profile editor is shared with the preview Home; do not fork application data or business rules. Shared Log links target the own-profile Ranking in both modes. Only the preview Home's Log action uses `/?log=1`, which redirects to the profile dialog after switching back to Classic.
- A future default switch should follow feedback and passing checks. Once the maintainer accepts the new default and the fallback is no longer needed, remove the Classic branch, preview control and preference together rather than accumulating permanent layout variants.
- Revisit a managed flag service when multiple flags, cohorts, shared account-level preferences or a central no-deploy shutoff justify it.

References: [release flags](https://launchdarkly.com/docs/eu-docs/home/flags/release), [blue/green deployments](https://docs.aws.amazon.com/whitepapers/latest/blue-green-deployments/introduction.html).
