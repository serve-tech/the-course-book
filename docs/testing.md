# Testing and verification

Use the Node version from `.nvmrc` and install the committed dependencies with `npm ci`. The exact scripts are in [package.json](../package.json).

## Standard checks

Run before considering a change complete:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

For application changes, also run the browser suite:

```sh
npx playwright install chromium
npm run test:e2e
```

Install Chromium once per environment; Linux CI uses `npx playwright install --with-deps chromium` for system dependencies. Browser tests build the app and serve it at http://127.0.0.1:4173/the-course-book/. Stop an old preview server before testing a fresh build: Playwright may reuse an existing server locally.

For documentation-only changes, check referenced paths, links, commands and claims against the repository and run the standard checks. No new behavioral test is needed when application behavior is unchanged. CI still runs its complete suite.

`npm run test:watch` supports focused unit-test work. `npm run format` formats source, browser tests and listed configuration files; it does not format every Markdown document or the preserved legacy stylesheet.

## What each layer proves

| Check | Scope and limits |
| --- | --- |
| `lint` | Typed ESLint and React hooks rules under `src/`; generated database types are excluded |
| `typecheck` | Strict checks for `src/`, Vite and Playwright configuration; browser test files are not included in this TypeScript project |
| `npm test` | Vitest feature tests, then Node tests in `tests/*.test.mjs`, including frozen legacy-auth characterization and migration preflight checks |
| `build` | Typecheck plus Vite's production static artifact and asset paths |
| `test:e2e` | Playwright user flows with synthetic backend responses, desktop Chromium and Chromium emulating an iPhone viewport |
| Visual parity scenario | Initial My List layout compared with the executable frozen legacy fixture; not every view/dialog or full pixel equality |

A green mocked suite does not verify live RLS, a real user's password, email delivery, physical iPhone/Safari keyboard behavior or every historical record. Describe those limits accurately.

## Add tests in the right place

- **Pure logic:** colocate `*.test.ts` with the feature module. Test domain behavior and edge cases with data-driven examples. See [identity.test.ts](../src/features/catalog/identity.test.ts) and [account-state.test.ts](../src/features/journal/account-state.test.ts).
- **Services/store:** instantiate real service/store logic with fake repository interfaces and storage. Verify meaningful outcomes, failures and race conditions. See [round-service.test.ts](../src/features/rounds/round-service.test.ts) and [journal-store.test.ts](../src/features/journal/journal-store.test.ts).
- **Components:** use colocated `*.test.tsx` with the existing Testing Library dependencies when a focused UI test is useful. Assert accessible/user-visible behavior rather than private state.
- **Browser flows:** extend [course-book.spec.ts](../tests/e2e/course-book.spec.ts) and the synthetic routes in [backend.ts](../tests/e2e/backend.ts). Exercise dialogs, interactions and visible success/failure through the production build.
- **Migration tooling:** keep script tests separate in `tests/*.test.mjs`. Use injected/mocked management responses; do not require a production access token.

Mock external dependencies such as Supabase, external course search, storage or location APIs. Do not mock the domain/service logic whose behavior the test claims to verify. Add fixtures to the existing feature tests or [src/test/fixtures.ts](../src/test/fixtures.ts) when actually shared.

## Regressions to consider by change

| Area changed | Relevant assertions |
| --- | --- |
| Auth form | Visible email reaches sign-in; signup username/confirmation path remains distinct; errors recover |
| Course matching/search | Canonical identity survives richer labels, aliases and inconsistent geography |
| Round logging/count/history | Correct count source; existing rank untouched; partial-write compensation; newest history retained on count reduction |
| Async journal/service operations | Account switch, A → B → A generation change, hydration racing local edits, stale responses |
| Personal ordering/filtering | Hidden memberships survive filtered moves; geographic filters remain read-only |
| Cache/persistence | Existing account isolation, legacy ownership, malformed or unavailable storage |
| UI/navigation/styles | Existing flows at desktop/mobile sizes, accessible dialog controls, no unintended overflow |

Choose tests that exercise the changed risk; do not add tests that only restate a constant or mirror the implementation. A bug fix needs a regression that would fail with the bug present.

## Live checks and schema checks

Do not sign into production or create/delete real records as part of an automated test. Local manual interaction uses production by default. A live write test needs explicit authorization, a defined account/data scope and an agreed cleanup plan.

The migration preflight is read-only:

```sh
node scripts/check-migration-history.mjs
```

It requires `SUPABASE_ACCESS_TOKEN` supplied securely and checks the project selected by the shared public configuration. It compares the remote ledger with local migration files; it neither applies migrations nor proves schema/security correctness. Never alter the ledger just to make this check pass.

## CI and handoff

[Verify application](../.github/workflows/ci.yml) runs lint, typecheck, unit/script tests, build and browser tests on configured working branches and PRs. Failure artifacts retain browser traces under `test-results/`.

[Deploy GitHub Pages](../.github/workflows/pages.yml) runs separately on `main` and publishes `dist/`. It runs lint, unit/script tests and build, but does not depend on the full verification workflow. Check PR verification before merging.

Report checks actually run, their outcomes and any remaining gaps. Do not present old characterization tests as new React coverage or Chromium device emulation as a physical iOS test.
