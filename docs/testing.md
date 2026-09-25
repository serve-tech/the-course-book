# Testing and verification

Use the Node version from `.nvmrc` and install the committed dependencies with `pnpm install --frozen-lockfile`. The exact scripts are in [package.json](../package.json) and each workspace package's `package.json`.

Database-backed tests need the local Postgres: `docker compose up -d db` once, then `pnpm test`. The API's `db` project migrates the test database (`DATABASE_URL_TEST`) before running. `pnpm test:unit` runs only the projects that need no database.

## Standard checks

Run before considering a change complete:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contract:check
```

`pnpm build` builds the API bundle and the web app; the web build needs `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` (from `.env`, or any valid-looking values when only checking that it compiles). `pnpm typecheck` regenerates route types first. `pnpm contract:check` regenerates `contract/openapi.json` and the web's API types and fails if they differ from the committed files; after changing an API route or schema, run `pnpm contract:emit` and commit the result. For application changes, also run the browser suite:

```sh
pnpm --filter @coursebook/e2e exec playwright install chromium
pnpm test:e2e
```

Pass Playwright options after `--`, e.g. `pnpm test:e2e -- --reporter=line`.

The browser suite builds and starts the API on port 3001 against the test database, builds the web app and serves it on port 3000 with [static-server.ts](../tests/e2e/static-server.ts) (the same `index.html` fallback and headers as the Render static site), starts the OpenGolfAPI stub on port 3999, and runs a `setup` project that migrates the database and prepares Clerk. Every scenario needs real Clerk development-instance keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`): every page waits for Clerk to load before loading data, and with placeholder keys it never loads. Authenticated scenarios additionally need `E2E_OWNER_EMAIL` and `E2E_FRIEND_EMAIL` for two test users with usernames and first names. Tests sign in with Clerk's ticket strategy (a sign-in token minted with the secret key), not a password: Clerk's Client Trust asks a password sign-in from an unrecognized device for an emailed code, and every test browser is a new device. The account-deletion scenario creates and deletes its own throwaway development user. Missing values skip the affected scenarios with a stated reason rather than failing; there is no stubbed-auth mode. In CI these come from repository secrets prefixed `E2E_`.

For documentation-only changes, check referenced paths, links, commands and claims against the repository and run the standard checks.

## What each layer proves

| Check | Scope and limits |
| --- | --- |
| `lint` | Typed ESLint across every workspace package, React hooks rules for the web app, and import boundaries: the domain package stays framework-, database- and Node-free; the API has no UI imports; the web app never imports server code or database libraries |
| `typecheck` | `tsc` in every workspace package (`pnpm -r typecheck`), with generated route types for the web app; the domain package checks without DOM or Node types |
| `pnpm test` | Vitest across the packages' projects: `domain`; `@coursebook/api (node)` and `(db)`; `@coursebook/web (node)` and `(jsdom)`. API `*.db.test.ts` suites run the real app or services against the migrated test database, serially |
| `pnpm db:check` and `pnpm db:generate` | Migration drift gate: the snapshot chain is consistent and `apps/api/src/db/schema.ts` produces no new migration. CI fails if `apps/api/src/db/migrations` changes |
| `pnpm contract:check` | The committed contract and web API types match the route definitions. `contract.test.ts` adds the rules native clients depend on: served and committed documents match, operations uniquely named, no polymorphic schemas, no email properties, response fields required, every secured operation 401s without a token |
| `build` | The API bundle (`apps/api/dist`) and the static web app (`apps/web/build/client`) |
| `test:e2e` | Playwright user flows against the built API and static web app, the migrated test database, the local OpenGolfAPI stub ([tests/e2e/opengolf-stub.ts](../tests/e2e/opengolf-stub.ts)) and a Clerk development instance; desktop Chromium and Chromium emulating an iPhone viewport, one test at a time because every scenario shares the two test users |
| CI `docker` job | The API image builds, starts with no `node_modules`, migrates on start, serves `/healthz`, the 1430 seeded rankings and a 401 without a token |

A green suite does not verify Clerk's production instance, Render's environment or DNS. Describe those limits accurately.

## Add tests in the right place

- **Pure logic:** colocate `*.test.ts` with the module. Use data-driven cases. See [identity.test.ts](../apps/api/src/domain/identity.test.ts), [reorder.test.ts](../packages/domain/src/journal/reorder.test.ts) and the contract mappers in [mappers.test.ts](../apps/api/src/contract/mappers.test.ts).
- **Services:** `*.db.test.ts` suites use `testDatabase()` and `resetMemberData()` from [apps/api/src/test/db.ts](../apps/api/src/test/db.ts) in `beforeEach`; the seeded catalog stays. Assert on rows, not on mocks; use `expectDbError` to match constraint names in the driver's cause chain, and assert expected failures with `rejects.toMatchObject({ status, code })` on the thrown `AppError`. See [journal.db.test.ts](../apps/api/src/services/journal.db.test.ts).
- **API operations:** build the real app with `createTestApp(db)` from [apps/api/src/test/app.ts](../apps/api/src/test/app.ts) and call it with `app.request()`. Tokens are signed per run with a local key and checked by the real Clerk verifier; only course discovery and Clerk account deletion are faked. Parse response bodies with the contract schemas. See [write.db.test.ts](../apps/api/src/routes/write.db.test.ts).
- **Web client code:** pure mappers and the API client are unit-tested with an injected `fetch` ([client.test.ts](../apps/web/app/lib/api/client.test.ts)). Components: colocated `*.test.tsx` with Testing Library when a focused UI test is useful.
- **Browser flows:** extend [course-book.spec.ts](../tests/e2e/course-book.spec.ts). Mock only external boundaries: the OpenGolfAPI stub server and Clerk testing tokens. The database is real; [tests/e2e/db.ts](../tests/e2e/db.ts) seeds the fixture courses and resets both test members to the baseline scenario before each authenticated test. Assert persisted outcomes through it.

Mock external services, not the domain or service logic whose behavior the test claims to verify.

## Regressions to consider by change

| Area changed | Relevant assertions |
| --- | --- |
| Course matching/search | Canonical identity survives richer labels, aliases and inconsistent geography; catalog hits carry `courseId`; catalog rows never appear as search results; CSV fallback and `search_unavailable` |
| Round logging/count/history | Count equals round rows; existing rank untouched; oldest rounds removed first on count reduction (newest history kept); last-round delete removes membership; returned lists match the database |
| Personal ordering/filtering | Move renumbers the full list; hidden memberships survive filtered moves; geographic filters remain read-only; ranks stay contiguous under concurrent moves |
| Authorization | Writes affect only the token's member; secured operations 401 before validation; web tokens need an allowed `azp`; deleted accounts cannot write or be re-provisioned; no emails anywhere |
| Contract | Additive only; `pnpm contract:emit` committed; `contract.test.ts` passes |
| UI/navigation/styles | Existing flows at desktop/mobile sizes, accessible dialog controls, error panels with Retry |

A bug fix needs a regression that would fail with the bug present.

## Live checks

Do not sign into production or create/delete real records as part of an automated test. Local development uses the docker-compose database and a Clerk development instance. A live production check needs explicit authorization, a defined account and an agreed cleanup plan.

## CI and handoff

[Verify application](../.github/workflows/ci.yml) runs lint, typecheck, the migration drift gate, the API contract drift gate, migrations against a Postgres service, all tests and the build on working branches and PRs, then a `browser` job with the Playwright suite and a `docker` job that builds and smoke-tests the API image.

[Deploy GitHub Pages](../.github/workflows/pages.yml) still publishes the retired static application from `main` until cutover; it does not run on the rebuild branch.

Report checks actually run, their outcomes and any remaining gaps.
