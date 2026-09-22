# Testing and verification

Use the Node version from `.nvmrc` and install the committed dependencies with `pnpm install --frozen-lockfile`. The exact scripts are in [package.json](../package.json).

## Standard checks

Run before considering a change complete:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm typecheck` regenerates route types first; run it after adding or renaming routes. For application changes, also run the browser suite once it exists on the branch (rebuild phase 7):

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

For documentation-only changes, check referenced paths, links, commands and claims against the repository and run the standard checks.

## What each layer proves

| Check | Scope and limits |
| --- | --- |
| `lint` | Typed ESLint and React hooks rules over `app/`, `scripts/` and config files; `src/` and `tests/` are excluded during the rebuild |
| `typecheck` | Strict checks for `app/`, `scripts/` and configuration, with generated route types |
| `pnpm test` | Vitest with two projects: `node` for pure modules, server modules and scripts; `jsdom` for component tests. Database-backed suites (`*.db.test.ts`, from phase 2) run in the node project against `DATABASE_URL_TEST` |
| `build` | Client and server bundles under `build/` |
| `test:e2e` | Playwright user flows against the built server, a test database, a local OpenGolfAPI stub and Clerk testing tokens (phase 7) |

A green suite does not verify Clerk's production instance, Render's environment or DNS. Describe those limits accurately.

## Add tests in the right place

- **Pure logic:** colocate `*.test.ts` with the module. Use data-driven cases. See [identity.test.ts](../app/features/catalog/identity.test.ts) and [reorder.test.ts](../app/features/journal/reorder.test.ts).
- **Loaders and actions:** call the exported `loader`/`action` with a `Request` and a `RouterContextProvider` carrying a test user, against the local test database. Truncate user data in `beforeEach`. Assert on rows, not on mocks. Cover `requireUser` with a null context.
- **Components:** colocated `*.test.tsx` with Testing Library when a focused UI test is useful. Assert accessible, user-visible behavior.
- **Browser flows:** extend `tests/e2e/course-book.spec.ts`. Mock only external boundaries: the OpenGolfAPI stub server and Clerk testing tokens. The database is real.
- **Compatibility:** `app/server/clerk.smoke.test.ts` proves the Clerk middleware and `getAuth` work under React Router's middleware. Keep it passing across dependency updates.

Mock external services, not the domain or server logic whose behavior the test claims to verify.

## Regressions to consider by change

| Area changed | Relevant assertions |
| --- | --- |
| Course matching/search | Canonical identity survives richer labels, aliases and inconsistent geography; catalog rows never appear as search results; CSV fallback and visible failure |
| Round logging/count/history | Count equals round rows; existing rank untouched; newest rounds removed first on count reduction; last-round delete removes membership |
| Personal ordering/filtering | Move renumbers the full list; hidden memberships survive filtered moves; geographic filters remain read-only; ranks stay contiguous |
| Authorization | Writes affect only the context user; anonymous access limited to index and Top 100; friends data carries no emails |
| UI/navigation/styles | Existing flows at desktop/mobile sizes, accessible dialog controls, no hydration mismatch |

A bug fix needs a regression that would fail with the bug present.

## Live checks

Do not sign into production or create/delete real records as part of an automated test. Local development uses the docker-compose database and a Clerk development instance. A live production check needs explicit authorization, a defined account and an agreed cleanup plan.

## CI and handoff

[Verify application](../.github/workflows/ci.yml) runs lint, typecheck, tests and build on working branches and PRs. The Postgres service, migration drift gate, browser tests and Docker build are added in phases 2, 7 and 8.

[Deploy GitHub Pages](../.github/workflows/pages.yml) still publishes the retired static application from `main` until cutover; it does not run on the rebuild branch.

Report checks actually run, their outcomes and any remaining gaps.
