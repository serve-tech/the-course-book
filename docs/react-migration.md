# React migration compatibility notes

Baseline: `b4b34b4`. Implementation branch: `feat/react-typescript`. No production deployment or database mutation is part of this rewrite.

## Contracts retained

- Email/password sign-in and signup confirmation, including the regression that sign-in reads the visible email rather than a hidden signup field.
- Existing project, session storage, local account caches and legacy one-time cache ownership.
- Round rows determine play counts. Membership and personal rank remain separate. Logging an existing course never changes its rank.
- Existing local order survives cloud hydration. Explicit moves synchronize personal ranks. Fresh-device startup does not rewrite an existing cloud list.
- Bundled IDs, canonical Scottish identities, ranked course matching, ranking pagination and course fetch batches.
- My List geographic views remain read-only; text search retains editing. Top progress ignores search and Show mine filters.
- Friends is the directory of registered members, not a separate friendship graph.
- Manual course entry, round quantities, count editing, history, deletion confirmation, state preference and optional geolocation.
- Existing CSS cascade, logo, mobile breakpoints and GitHub Pages URL.

## Intentional correctness improvements

These preserve normal user workflows while avoiding known unsafe failure behavior:

- React renders external names as text instead of inserting untrusted HTML.
- Reordering a searched list preserves hidden courses.
- Owner generation tokens reject stale operations after account switches, including A→B→A.
- Failed membership creation compensates newly inserted rounds; compensation failure is reported explicitly.
- In-flight form controls prevent accidental repeat submissions. Failed count edits remain usable.
- Storage and API boundaries validate data and report nonfatal failures.
- React effect cleanup removes timers, subscriptions and pending search requests.

## Characterized legacy quirks retained for separate product decisions

- Fresh-device list order follows round history before membership-only course ranks.
- Editing play count to zero removes cloud membership but can retain local zero-round membership; explicit Delete Course removes it locally.
- Manual requested rank is stored remotely, but an existing local list appends the course during hydration.
- The Pinehurst No. 4 alias currently resolves to the legacy `usa80` record. Correcting historical identities needs a separate data-aware change.
- OpenGolf's existing case-sensitive US-country interpretation and the USA catalog's 1,000-row cap remain.
- Incomplete published ranking scopes retain the existing loading presentation.

## Verification scope

Tests use synthetic accounts and mocked external APIs. Service tests cover owner races, existing cloud rank protection, membership-only migration, round compensation, count reduction, state persistence and identity reconciliation. Browser tests exercise the production build at desktop and mobile sizes and compare the initial layout directly with the frozen legacy page.

These checks do not send real confirmation emails, mutate production records or validate physical iOS keyboard behavior. Before release, review the branch and smoke-test the normal workflows with an authorized account. Existing Supabase policy/security findings from the infrastructure migration are outside this frontend rewrite.

## References

- [Architecture decision](../.planning/decisions/2026-09-18-react-typescript-architecture.md)
- [React guidance for building from scratch](https://react.dev/learn/build-a-react-app-from-scratch)
- [Vite GitHub Pages deployment](https://vite.dev/guide/static-deploy.html#github-pages)
- [Supabase generated TypeScript types](https://supabase.com/docs/guides/api/rest/generating-types)
