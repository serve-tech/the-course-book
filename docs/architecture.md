# Architecture and extension guide

coursebook.golf is a JSON API with clients. The API (`apps/api`, Hono on Node) owns the data and every authorization decision; it reads and writes Postgres through Drizzle and verifies Clerk session tokens. The web app (`apps/web`) is a static React Router single-page app that calls the API like any other client; native iOS and Android apps will call the same API. Everything runs on Render. Background: the [rebuild decision](../.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md) (Render, Postgres, Clerk) and the [split decision](../.planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md) (API and clients). [AGENTS.md](../AGENTS.md) supplies mandatory working rules.

## Status

Built and tested on `feat/render-clerk-rebuild`: the API with its read and write operations and account deletion, the published contract, the static web app on the API, the API Docker image and the Render Blueprint. Still open: the first Render deploy (maintainer approval), the data import rehearsal and cutover ([cutover.md](cutover.md)), and the native apps (their own plan).

## Deployables

| Piece | What it is | Render resource |
| --- | --- | --- |
| API | `apps/api`, bundled by esbuild into one file and shipped in a Docker image ([Dockerfile](../apps/api/Dockerfile)). Runs migrations on start, then serves `/healthz` and `/v1/*` | `coursebook-api` web service |
| Web app | `apps/web/build/client`, static files with an `index.html` fallback for client-side routes | `coursebook-web` static site |
| Database | Postgres 17 | `coursebook-db` |
| Contract | [contract/openapi.json](../contract/openapi.json), generated from the API's route definitions; clients generate their code from it | not deployed; also served at `/v1/openapi.json` |

[render.yaml](../render.yaml) is the source of truth. Staging uses free plans; the cutover moves the database, then the API, to paid plans.

## Responsibilities

| Location | Owns | Starting example |
| --- | --- | --- |
| `apps/api/src/app.ts` | `createApp(dependencies)`: middleware order, CORS, body limit, sessions, error envelope, route registration | [app.ts](../apps/api/src/app.ts) |
| `apps/api/src/contract/` | Operation definitions and named schemas (no handler code), contract mappers, document settings | [routes.ts](../apps/api/src/contract/routes.ts), [schemas.ts](../apps/api/src/contract/schemas.ts), [mappers.ts](../apps/api/src/contract/mappers.ts) |
| `apps/api/src/routes/` | Handlers attached to the operations; each calls one service | [journal.ts](../apps/api/src/routes/journal.ts), [account.ts](../apps/api/src/routes/account.ts) |
| `apps/api/src/auth/` | Clerk token verification, the `azp` policy, session middleware, Clerk account deletion | [session.ts](../apps/api/src/auth/session.ts), [azp.ts](../apps/api/src/auth/azp.ts) |
| `apps/api/src/services/` | Environment validation, user provisioning, catalog and search, journal transactions, friends reads, account data deletion, health. Framework-free; expected failures throw `AppError` | [journal.ts](../apps/api/src/services/journal.ts), [provisioning.ts](../apps/api/src/services/provisioning.ts) |
| `apps/api/src/domain/` | API-only pure rules: course identity, OpenGolfAPI parsing, row-to-course views, the username rule | [identity.ts](../apps/api/src/domain/identity.ts) |
| `apps/api/src/db/` | Drizzle schema, committed SQL migrations, seed data, migration runner | [schema.ts](../apps/api/src/db/schema.ts), [migrate.ts](../apps/api/src/db/migrate.ts) |
| `apps/api/scripts/` | Contract emitter, seed builder, Supabase import | [emit-openapi.ts](../apps/api/scripts/emit-openapi.ts), [plan.ts](../apps/api/scripts/import/plan.ts) |
| `packages/domain/src/` | Pure rules both sides run: course model, geography, ranking selectors, list reorder, shared types | [course.ts](../packages/domain/src/catalog/course.ts), [reorder.ts](../packages/domain/src/journal/reorder.ts) |
| `apps/web/app/lib/api/` | The typed API client (generated `schema.d.ts`, bearer tokens, `ApiError`), contract-to-domain mappers, the slow-server notice | [client.ts](../apps/web/app/lib/api/client.ts), [mappers.ts](../apps/web/app/lib/api/mappers.ts) |
| `apps/web/app/root.tsx`, `routes.ts`, `routes/` | Document shell with `ClerkProvider`, route configuration, per-route `clientLoader`/`clientAction` and pages | [root.tsx](../apps/web/app/root.tsx), [journal.ts](../apps/web/app/routes/journal.ts) |
| `apps/web/app/features/<feature>/` | Pages, dialogs and hooks for catalog (Rankings), journal (My List), rounds, friends and auth | [JournalPage.tsx](../apps/web/app/features/journal/JournalPage.tsx), [LogRoundDialog.tsx](../apps/web/app/features/rounds/LogRoundDialog.tsx) |
| `apps/web/app/shared/` | Modal, StateSelect, RouteError, SafeStorage, geolocation, error formatting, country data, `legacy.css` | [Modal.tsx](../apps/web/app/shared/ui/Modal.tsx), [storage.ts](../apps/web/app/shared/lib/storage.ts) |
| `tests/e2e/` | Playwright user flows against the built API and web app | [course-book.spec.ts](../tests/e2e/course-book.spec.ts) |

In the web app, feature folders are the organizational unit; avoid global `components/` folders that scatter one feature across the project.

## Request flow

1. A client obtains a Clerk session token (`getToken()` in the web app; the Clerk iOS and Android SDKs in the apps) and sends it as `Authorization: Bearer <token>`. The web client sends no token to public operations and never sends cookies (`credentials: "omit"`).
2. The API's session middleware treats a request with no Authorization header as anonymous without calling Clerk. With a header it verifies the token (`authenticateRequest`, local `CLERK_JWT_KEY` when set) and applies the `azp` policy; a token that does not verify is a 401, never a silent downgrade.
3. Secured operations (those with `security` in the contract) pass through `memberOnly` before input validation, so an anonymous request is a 401 rather than a 400. The handler's `requireUser` provisions the member's `users` row from the token claims (cached a minute per user) and rejects deleted accounts.
4. The route validates parameters and bodies against the contract schemas, calls one service, and maps the result to contract shapes. Every list change runs in one transaction under the member's advisory lock and returns the whole updated list read in that transaction.
5. Failures return the envelope `{ error: { code, message, requestId, fields } }` with a stable `code`. Unexpected errors are logged with the request id and reported as `internal`.
6. In the web app, route `clientLoader`s fetch page data and the `/journal` `clientAction` performs changes; React Router reloads the page's loaders after each change, so pages never keep a second copy of server data.

API operations are listed in [api.md](api.md); the contract is authoritative.

## Where state belongs

| State | Place |
| --- | --- |
| Open dialog, form fields, selected filter, temporary loading/error state | Component state |
| Account, memberships, rounds, courses, rankings | Postgres, owned by the API; clients read them through the API on every load |
| Course identity mapping | `courses.stable_id` and `courses.name_key`, resolved in the API's catalog service |
| Selected state for Best-in-State and My List filtering, geolocation prompt version | Browser storage through `SafeStorage` (keys `theCourseBookSelectedState`, `theCourseBookLocationPromptVersion`) |
| Session | Clerk in the browser; a short-lived session token per API request |
| Derived filtering, ordering and display values | Pure functions in `packages/domain` (shared) or the package that uses them |

Do not add a client store, a cache of API data or a persisted copy of the personal list. Optimistic UI during a pending move may apply `reorder()` locally; the reload replaces it. HTTP caching of the public rankings (ETag, `max-age`) is the only client-side cache.

## Schema

| Table | Purpose and key rules |
| --- | --- |
| `users` | One row per Clerk user (`id` is the Clerk id). `username` unique case-insensitively; `email` never leaves the API; `legacy_supabase_id` links imported accounts. Account deletion leaves a tombstone: `deleted_<random>` username, "Deleted member", personal fields cleared, `deleted_at` set. |
| `courses` | Shared catalog. Seeded rows keep their original UUIDs; `stable_id` carries the bundled ids (`usa1`, `michigan3`, `world1`); `name_key` is `normalizeName(name)`; custom courses set `is_custom` and `created_by` (cleared when the creator deletes their account). |
| `course_rankings` | Published lists: `ranking_type` in world, usa, usa_public, state; unique per (type, scope, rank) and per (course, type). |
| `user_courses` | Memberships. `personal_rank` is NOT NULL and contiguous 1..N per user (deferred unique constraint). |
| `rounds` | One row per round; composite foreign key to the membership, so a round cannot exist without one. Carries `played_at`, `score`, `tees`, `notes`. |

Play count is always `COUNT(rounds)`; there is no stored counter. All list changes take `pg_advisory_xact_lock(hashtext(user_id))` so concurrent moves, logs and account deletion serialize.

The seed migration (`0001_seed_catalog.sql`) carries the retired project's public catalog with original UUIDs, 281 bundled stable ids matched through the identity rules, and 24 bundled world-list courses the catalog lacked. Two bundled entries are duplicates of other bundled entries and carry no stable id. The catalog itself contains 13 pre-existing same-name, same-location duplicate pairs; the stable id went to the ranked or richer row, and merging duplicates is a separate data task. Services take a `Database` argument (`apps/api/src/db/client.ts`) so tests can pass the test database.

## Data rules

- **Counts:** the number of round rows is the play count. Never synthesize rounds from a count.
- **Order:** published rankings and personal rank are separate. Logging, count edits and adds never change an existing membership's rank. Only a move renumbers, and it renumbers the complete list from the full order so courses hidden by a filter keep their positions (`reorder()` in `packages/domain/src/journal/reorder.ts`).
- **Adding a catalog course** (`PUT /v1/me/courses/{courseId}`, used by Top 100 and Friends): add the membership at the bottom if missing and log one round when the course has none. Repeating it changes nothing. (Friends used to skip the round for an already-listed course with no rounds; one rule now covers both pages.)
- **Adding by details** (`POST /v1/me/courses`): resolve or create the course, place it at `rank` (clamped to [1, N+1], bottom when omitted) if it is new to the list, and log `quantity` rounds (default 1) on `playedOn`. `source: manual` marks a shared custom course. A U.S. course needs a resolvable state (`us_state_required`).
- **Logging** (`POST /v1/me/courses/{courseId}/rounds`): add the membership at the bottom if missing and log `quantity` rounds sharing one date. Clients send the member's local date; the server's date is UTC.
- **Counts and deletes:** setting the play count diffs against actual rounds (delete the oldest surplus so the newest history is kept, insert shortfall), as the original application did; zero deletes the membership. Deleting the last round deletes the membership. Deleting a course deletes the membership and cascades its rounds. All of these renumber remaining ranks.
- **Identity:** resolve a course through `identity.ts` before creating a row: explicit uuid, alias to `stable_id`, canonical Scottish geography, then `name_key` plus country with an exact normalized-location match, else insert under an advisory lock on `name_key`. External search ids are never stored as course ids.
- **Search:** OpenGolfAPI results are resolved against the catalog so known courses carry their uuid (`courseId`); other hits carry only their details. When the REST endpoint fails, the CSV dataset is searched (parsed once per process). Both failing is `search_unavailable`.
- **Rankings page:** progress uses the full list before search and "Show mine". World, USA and public lists render only with 100 unique ranks; state lists need a selected state and at least one row.
- **My List:** geographic filters are read-only (no drag or count editing); text search keeps editing.
- **Friends:** a paged directory of all other active members. Any signed-in member may view any member's list read-only; usernames match case-insensitively. Responses never include email addresses or user ids.
- **Account deletion** (`DELETE /v1/me`): data first, then the Clerk user; a retry after a Clerk failure finishes the job. Details under [Authentication and authorization](#authentication-and-authorization).
- **Preferences:** manual state selection and optional geolocation stay in browser storage.
- **Known data quirk:** the Pinehurst No. 4 alias resolves to the legacy `usa80` record; fixing it is a data change, not a code change.

## Authentication and authorization

Clerk holds credentials, Google sign-in, email verification and sessions. The API trusts only verified session tokens:

- **Verification:** [session.ts](../apps/api/src/auth/session.ts) calls `@clerk/backend` `authenticateRequest` with `acceptsToken: "session_token"`, so pending sessions count as signed out. With `CLERK_JWT_KEY` set, tokens verify locally, with no JWKS fetch after a cold start.
- **Authorized party:** `authorizedParties` is deliberately not passed: since `@clerk/backend` 3.11.1 it rejects every token without `azp`, and native app tokens have none. [azp.ts](../apps/api/src/auth/azp.ts) applies the policy instead: a token with `azp` must come from one of `WEB_ORIGINS`; a token without `azp` is accepted. The API accepts bearer tokens only and ignores cookies, so there is no cross-site request forgery surface.
- **Provisioning:** [provisioning.ts](../apps/api/src/services/provisioning.ts) upserts the `users` row from the token claims (cached a minute per user) and never refreshes a deleted account, so a token that outlives a deletion cannot restore personal data. The product's username rule (`^[A-Za-z0-9_]{3,24}$`) is enforced here (`username_invalid`).
- **Authorization rules:** anonymous clients may read the published rankings and client settings; everything under `/v1/me` and `/v1/members`, and search, needs a session; writes affect only the token's member; other members are exposed only as username and display name. [contract.test.ts](../apps/api/src/contract/contract.test.ts) proves every secured operation rejects anonymous calls.
- **Account deletion:** `DELETE /v1/me` removes the list and rounds, detaches created courses and tombstones the `users` row in one locked transaction, forgets the cached user, then deletes the Clerk user (a 404 counts as done). If Clerk fails, the API answers 502 `account_deletion_incomplete` and a retry goes straight to Clerk. The web Account page is also the deletion link Google Play requires.

Clerk dashboard configuration the code assumes:

- User & authentication: username required, first name required, email required, Google enabled.
- Sessions, customize session token: `{"username": "{{user.username}}", "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "image_url": "{{user.image_url}}"}`. Without it, provisioning fetches the user from the Backend API.
- Account deletion by members is done through the app; turn off Clerk's self-service account deletion so it cannot bypass the API.
- API keys: the JWT public key goes into the API's `CLERK_JWT_KEY`.
- Production instance: DNS records on coursebook.golf, the project's own Google OAuth client, and later Sign in with Apple for the iOS app (App Store rule 4.8).

The web account dialog ([AuthDialog.tsx](../apps/web/app/features/auth/AuthDialog.tsx)) keeps the legacy modal chrome and ids and renders Clerk's `SignIn`/`SignUp` with hash routing; `/sign-in/*` and `/sign-up/*` exist for OAuth callbacks and direct links. `ClerkProvider` sits in the root `Layout`, not `App`, because route `clientLoader`s await `getToken()` before `App` renders.

## Contract and clients

The contract grows only; its rules (named schemas, always-present response fields, `.nullish()` request fields, error codes as documented strings) are in [contract/README.md](../contract/README.md) and enforced by `contract.test.ts`. The web app's types are generated from it (`pnpm contract:emit`), and CI fails when the committed contract or types are stale. Clients read `GET /v1/client-config` at launch; its minimum versions are how installed app builds are told to update.

## Types and boundaries

[course.ts](../packages/domain/src/catalog/course.ts) defines the domain course model with Zod; Drizzle infers row types from `apps/api/src/db/schema.ts`; the contract defines the wire shapes. Keep the three separate: mappers in `apps/api/src/contract/mappers.ts` and `apps/web/app/lib/api/mappers.ts` are the only places that know two of them.

Validate untrusted input at boundaries: request parameters and bodies (contract schemas), environment variables at startup ([env.ts](../apps/api/src/services/env.ts)), external API responses, and token claims. Use `unknown` until validated. In the web app, [errors.ts](../apps/web/app/shared/lib/errors.ts) formats errors and `RouteError` shows a failed page load with Retry inside the layout. Noncritical failures (geolocation, search fallback) log and degrade; failed mutations show a visible failure and leave controls usable.

## Hosting and operations

- **Cold starts:** a free web service sleeps after 15 idle minutes and takes about a minute to wake; the web app shows "Waking the server…" when a request is slow and waits up to 90 seconds. The static site never sleeps. Before the native apps ship, the API moves to a paid plan so phones never wait.
- **Migrations** run in the API process before it listens (free plans have no pre-deploy step), under a session advisory lock, so an overlapping deploy migrates once. Migrations must stay backward-compatible with the previous release, which keeps serving while the new one starts.
- **Per-process caches:** the catalog snapshot (10 minutes, invalidated after a course is created), the search dataset and the provisioning cache assume one API instance; correctness never depends on them.
- **Logs:** one JSON line per API request with its request id, which also appears in every error envelope and the `X-Request-Id` header.

## Appearance

Reuse the existing markup, element ids, shared primitives and `legacy.css`. The stylesheet preserves what Chromium parsed from the original page, including rules the browser ignored; broad cleanup changes appearance. New screens (Account, Privacy) append their few rules at the end of the file. The root route renders once at build time into `index.html`, so anything that depends on `window`, `document`, `localStorage` or the viewport runs in an effect.

## Cutover

The retired Supabase project is read-only for this repository. [cutover.md](cutover.md) is the step-by-step runbook: Render staging from the branch, the Clerk production instance, an import rehearsal with `pnpm import:supabase --dry-run` (planning rules in `apps/api/scripts/import/plan.ts`, tested), the database upgrade, the freeze and real import, the domains, and the switch of `render.yaml` and the deploy to `main`. Keep Supabase paused, not deleted, until a Render database restore has been tested.
