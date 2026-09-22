# Architecture and extension guide

coursebook.golf is a server-rendered React Router application. One Node process serves pages, loaders and actions, reads and writes Postgres through Drizzle, and delegates identity to Clerk. It ships as a Docker image deployed on Render. The [rebuild decision](../.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md) explains this choice. [AGENTS.md](../AGENTS.md) supplies mandatory working rules.

## Rebuild status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Tooling (pnpm, React Router 8, Vitest projects, ESLint), root document, placeholder index and `/healthz`, pure modules moved with tests, Clerk/React Router compatibility smoke test, documentation | landed |
| 2 | Drizzle schema, migrations, seed catalog, docker-compose Postgres, database-backed tests, CI drift gate | landed |
| 3 | Clerk middleware, user provisioning, authorization module, layout with auth bar/nav/toast, sign-in dialog | pending |
| 4 | Server-side catalog, identity resolution and course search; Top 100 page | pending |
| 5 | Journal transactions and action; My List page, dialogs, drag reorder | pending |
| 6 | Friends page; delete `src/` and Supabase artifacts | pending |
| 7 | Browser tests and complete CI | pending |
| 8 | Dockerfile, `render.yaml`, first deploy from the branch | pending |
| 9 | Data import, cutover runbook, domain | pending |

Anything marked pending is described below in its intended shape so work lands consistently. Do not treat a pending module as existing.

## Responsibilities

| Location | Owns | Starting example |
| --- | --- | --- |
| `app/root.tsx` | Document shell, stylesheet link, manifest, error boundary, Clerk provider and middleware export | [root.tsx](../app/root.tsx) |
| `app/routes.ts`, `app/routes/` | Route configuration; per-route loaders, actions and pages | [routes.ts](../app/routes.ts), [healthz.ts](../app/routes/healthz.ts) |
| `app/server/*.server.ts` | Environment validation, database handle, auth context and user provisioning, authorization rules, catalog and search, journal transactions, friends reads | [env.server.ts](../app/server/env.server.ts), [db.server.ts](../app/server/db.server.ts) |
| `app/db/` | Drizzle schema, committed SQL migrations, seed data, migration runner | [schema.ts](../app/db/schema.ts), [migrate.ts](../app/db/migrate.ts) |
| `app/features/catalog/` | Course model, identity and geography rules, ranking selectors, OpenGolfAPI parsing, Rankings page | [identity.ts](../app/features/catalog/identity.ts), [opengolf.ts](../app/features/catalog/opengolf.ts) |
| `app/features/journal/` | Pure personal-order rules, My List page, details and count editing, drag reorder | [reorder.ts](../app/features/journal/reorder.ts) |
| `app/features/rounds/` | Log Round and Add Course dialogs, round history | pending |
| `app/features/friends/` | Member directory page | pending |
| `app/features/auth/` | Username rule, sign-in dialog wrapping Clerk components | [username.ts](../app/features/auth/username.ts) |
| `app/shared/` | Modal, StateSelect, SafeStorage, geolocation, error formatting, geographic data, `legacy.css` | [Modal.tsx](../app/shared/ui/Modal.tsx), [storage.ts](../app/shared/lib/storage.ts) |

Feature folders are the organizational unit; avoid global `components/` or `services/` folders that scatter one feature across the project. Server-only files end in `.server.ts` so the framework refuses to bundle them for the browser.

## Request flow

1. `app/middleware.ts` exports `[clerkMiddleware(), appUserMiddleware]`. Clerk verifies the session; `appUserMiddleware` reads `getAuth(args)` and, for a signed-in user, upserts the `users` row from session claims and stores the app user in a router context (`userContext`). `root.tsx` re-exports the middleware and its loader returns `rootAuthLoader(args)` so `<ClerkProvider>` can hydrate.
2. A route loader reads `context.get(userContext)` and calls one server module. Anonymous access is allowed on the index and Top 100 routes and returns empty personal data; Friends and search call `requireUser`, which throws a 401 `data()` response.
3. Every mutation posts to the `/journal` action with an `intent` field. The action requires a user, parses the form with Zod, and runs one server function inside a single transaction. The user id always comes from the context.
4. After a fetcher submission React Router revalidates the current route's loader, so pages never hold a second copy of server data.

Routes:

| Route | Loader data | Access |
| --- | --- | --- |
| layout | `{ user: { id, username, displayName } \| null }` | anonymous ok |
| `/` My List | `{ courses: [{ id, name, location, city, state, country, rank, played }] }` ordered by personal rank | anonymous gets an empty list |
| `/top-100` | `{ rankings, played, onList }`; `selectRankings` runs client-side | anonymous ok |
| `/friends/:username?` | `{ members: [{ username, displayName }], selected?: { username, displayName, rows } }`; no emails, no user ids | signed in |
| `/api/course-search?q=` | `SearchResult[]`; 400 when `q` is shorter than 2 characters | signed in |
| `/journal` | POST action by intent (`log`, `top`, `friend`, `add-course`, `move`, `set-count`, `delete-round`, `delete-course`); GET returns the caller's rounds for one course | signed in |
| `/healthz` | `{ ok }` after `SELECT 1`; 503 on failure | none |
| `/sign-in/*`, `/sign-up/*` | Clerk pages, needed for OAuth callbacks; the in-app dialog is the primary entry | anonymous |

## Where state belongs

| State | Place |
| --- | --- |
| Open dialog, form fields, selected filter, temporary loading/error state | Component state |
| Account, memberships, rounds, courses, rankings | Postgres, read through loaders |
| Course identity mapping | `courses.stable_id` and `courses.name_key` columns, resolved in `catalog.server.ts` |
| Selected state for Best-in-State and My List filtering, geolocation prompt version | Browser storage through `SafeStorage` (keys `theCourseBookSelectedState`, `theCourseBookLocationPromptVersion`) |
| Session | Clerk cookies; app user resolved per request into `userContext` |
| Derived filtering, ordering and display values | Pure functions in `app/features/` |

Do not add a client store, a cache of loader data or a persisted copy of the personal list. Optimistic UI during a pending fetcher may apply `reorder()` locally; revalidation replaces it.

## Schema

| Table | Purpose and key rules |
| --- | --- |
| `users` | One row per Clerk user (`id` is the Clerk id). `username` unique case-insensitively; `email` never leaves the server; `legacy_supabase_id` links imported accounts; rows are soft-deleted only. |
| `courses` | Shared catalog. Seeded rows keep their original UUIDs; `stable_id` carries the bundled ids (`usa1`, `michigan3`, `world1`); `name_key` is `normalizeName(name)`; custom courses set `is_custom` and `created_by`. |
| `course_rankings` | Published lists: `ranking_type` in world, usa, usa_public, state; unique per (type, scope, rank) and per (course, type). |
| `user_courses` | Memberships. `personal_rank` is NOT NULL and contiguous 1..N per user (deferred unique constraint). |
| `rounds` | One row per round; composite foreign key to the membership, so a round cannot exist without one. Carries `played_at`, `score`, `tees`, `notes`. |

Play count is always `COUNT(rounds)`; there is no stored counter. All journal mutations take `pg_advisory_xact_lock(hashtext(user_id))` so concurrent moves and logs serialize.

The seed migration (`0001_seed_catalog.sql`) carries the retired project's public catalog with original UUIDs, 281 bundled stable ids matched through the identity rules, and 24 bundled world-list courses the catalog lacked. Two bundled entries are duplicates of other bundled entries and carry no stable id. The catalog itself contains 13 pre-existing same-name, same-location duplicate pairs; the stable id went to the ranked or richer row, and merging duplicates is a separate data task, not a seed concern. Server modules take a `Database` argument (`app/db/client.ts`) so tests can pass the test database.

## Data rules

- **Counts:** the number of round rows is the play count. Never synthesize rounds from a count.
- **Order:** published rankings and personal rank are separate. Logging, count edits and adds from Rankings or Friends never change an existing membership's rank. Only `move` renumbers, and it renumbers the complete list from the full order so courses hidden by a filter keep their positions (`reorder()` in `app/features/journal/reorder.ts`).
- **Log Round intents:** `log` inserts N rounds (minimum 1) sharing one `played_at` and creates the membership at the bottom if missing. `top` adds the membership if missing and inserts a round only when none exists. `friend` is a no-op when the membership exists, else one round plus a membership at the bottom. `add-course` creates the course, inserts at the requested rank clamped to [1, N+1] (default bottom) and logs one round.
- **Counts and deletes:** `set-count` diffs against actual rounds (delete newest surplus, insert shortfall); zero deletes the membership. Deleting the last round deletes the membership. Deleting a course deletes the membership and cascades its rounds. All of these renumber remaining ranks.
- **Identity:** resolve a course through `identity.ts` before creating a row: explicit uuid, alias to `stable_id`, canonical Scottish geography, then `name_key` plus country with an exact normalized-location match, else insert under an advisory lock on `name_key`. External search ids are never stored as course ids.
- **Search:** OpenGolfAPI results are resolved against the catalog so known courses carry their uuid; the catalog itself is never returned as search results. When the REST endpoint fails, the CSV dataset is searched (parsed once per process). Both failing produces a visible error and a retry.
- **Rankings page:** progress uses the full list before search and "Show mine". World, USA and public lists render only with 100 unique ranks; state lists need a selected state and at least one row.
- **My List:** geographic filters are read-only (no drag or count editing); text search keeps editing.
- **Friends:** a directory of all other members. Any signed-in member may view any member's list read-only. Loader data never includes email addresses or user ids.
- **Preferences:** manual state selection and optional geolocation stay in browser storage.
- **Known data quirk:** the Pinehurst No. 4 alias resolves to the legacy `usa80` record; fixing it is a data change, not a code change.

## Authentication and authorization

Clerk holds credentials, Google sign-in, email verification and sessions. The dashboard requires a username, first name and email; the product's stricter username rule is re-checked in `provisionUser` (`app/features/auth/username.ts`). `authz.server.ts` states every rule in code with tests: anonymous reads are limited to the index and Top 100; writes only affect the context user; member lists are readable by any signed-in member. The production Clerk instance needs DNS records on coursebook.golf and the project's own Google OAuth client.

## Types and boundaries

[course.ts](../app/features/catalog/course.ts) defines the application course model with Zod. Drizzle infers row types from `app/db/schema.ts`. Keep these separate: a domain course is not a database row.

Validate untrusted form, environment, API and claim input at boundaries. Use `unknown` until validated. Use [errors.ts](../app/shared/lib/errors.ts) for error presentation. Noncritical failures (geolocation, search fallback) log and degrade; failed mutations show a visible failure and leave controls usable.

## Appearance

Reuse the existing markup, element ids, shared primitives and `legacy.css`. The stylesheet preserves what Chromium parsed from the original page, including rules the browser ignored; broad cleanup changes appearance. Loading it through `links()` in `root.tsx` keeps it in `<head>` before first paint. Anything that depends on `window`, `document`, `localStorage` or the viewport runs in an effect so server and client markup match.

## Cutover

The retired Supabase project is read-only for this repository. Cutover order: create the Clerk production instance; rehearse `scripts/import-supabase.ts` against a snapshot; pause the Supabase project; import and verify counts; point coursebook.golf at Render; switch `render.yaml` to `main`; merge; remove `pages.yml` and disable Pages. Keep Supabase paused, not deleted, until a Render database restore has been tested.
