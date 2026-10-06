# Architecture and extension guide

coursebook.golf is a JSON API with clients. The API (`apps/api`, Hono on Node) owns the data and every authorization decision; it reads and writes Postgres through Drizzle and verifies Clerk session tokens. The web app (`apps/web`) is a static React Router single-page app that calls the API like any other client; native iOS and Android apps will call the same API. Everything runs on Render. Background: the [rebuild decision](../.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md) (Render, Postgres, Clerk) and the [split decision](../.planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md) (API and clients). [AGENTS.md](../AGENTS.md) supplies mandatory working rules.

## Status

On `main` (PR #4, merged 2026-09-29): the API with its read and write operations and account deletion, the published contract, the static web app on the API, the API Docker image, the Render Blueprint and the member importer. The Render services deploy from `main` (URLs in the [README](../README.md)); the members were imported in a first pass on 2026-09-28. coursebook.golf and api.coursebook.golf serve them with the Clerk production instance. Still open: the end of the launch ([cutover.md](cutover.md) step 5.4: smoke test, pause Supabase, disable GitHub Pages) and the native apps (their own plan, with the release requirements in [cutover.md](cutover.md#6-after-cutover)).

## Deployables

| Piece | What it is | Render resource |
| --- | --- | --- |
| API | `apps/api`, bundled by esbuild into one file and shipped in a Docker image ([Dockerfile](../apps/api/Dockerfile)). Runs migrations on start, then serves `/healthz` and `/v1/*` | `coursebook-golf-api` web service |
| Web app | `apps/web/build/client`, static files with an `index.html` fallback for client-side routes | `coursebook-golf-web` static site |
| Database | Postgres 17 | `coursebook-db` |
| Contract | [contract/openapi.json](../contract/openapi.json), generated from the API's route definitions; clients generate their code from it | not deployed; also served at `/v1/openapi.json` |

[render.yaml](../render.yaml) is the source of truth for the infrastructure. Staging uses free plans; the cutover moves the database, then the API, to paid plans.

### Production configuration

Every production environment variable lives in Doppler, which syncs it to the Render service ([decision](../.planning/decisions/2026-10-05-doppler-is-the-single-source-of-truth-for-render-environment-variables.md)). `render.yaml` declares none, and a Blueprint sync keeps variables it omits. The API validates its variables at startup ([env.ts](../apps/api/src/services/env.ts)) and refuses to start without a required one. `VITE_*` values are compiled into the web bundle, so changing one needs a web rebuild; changing an API variable needs an API deploy. Confirm a change is live rather than assuming the sync deployed it.

| Service | Variable | What Doppler must hold |
| --- | --- | --- |
| API | `DATABASE_URL` | `coursebook-db`'s *internal* connection string. Update it in Doppler before the API redeploys whenever the database is recreated, restored into a new instance or its credentials change |
| API | `CLERK_SECRET_KEY` | Clerk production instance secret key; the only secret besides the database URL |
| API | `CLERK_PUBLISHABLE_KEY` | Clerk production publishable key (`pk_live_…`, encodes `clerk.coursebook.golf`); public |
| API | `CLERK_JWT_KEY` | The production instance's JWT public key (PEM; Clerk API keys, "Show JWT public key"), so tokens verify without a network call after a restart. Optional; without it the API fetches Clerk's keys |
| API | `WEB_ORIGINS` | `https://coursebook.golf,https://www.coursebook.golf,https://coursebook-golf-web.onrender.com`: exact origins, comma-separated, no trailing slash; used for CORS and the token `azp` check |
| API | `PUBLIC_WEB_URL` | `https://coursebook.golf` (privacy and account-deletion links) |
| API | `MIN_IOS_VERSION`, `MIN_ANDROID_VERSION`, `OPENGOLF_API_URL`, `OPENGOLF_CSV_URL`, `PORT` | Unset; the defaults in `env.ts` apply (Render sets `PORT`) |
| Web | `VITE_API_URL` | `https://api.coursebook.golf` |
| Web | `VITE_CLERK_PUBLISHABLE_KEY` | Same `pk_live_…` key as the API. Public: every `VITE_*` value ships in the browser bundle, so never a secret |
| Web | `NODE_VERSION` | `24`: the build uses corepack, which ships with Node 24 but not 25+ |

## Responsibilities

| Location | Owns | Starting example |
| --- | --- | --- |
| `apps/api/src/app.ts` | `createApp(dependencies)`: middleware order, CORS, body limit, sessions, error envelope, route registration | [app.ts](../apps/api/src/app.ts) |
| `apps/api/src/contract/` | Operation definitions and named schemas (no handler code), contract mappers, document settings | [routes.ts](../apps/api/src/contract/routes.ts), [schemas.ts](../apps/api/src/contract/schemas.ts), [mappers.ts](../apps/api/src/contract/mappers.ts) |
| `apps/api/src/routes/` | Handlers attached to the operations; each calls one service | [journal.ts](../apps/api/src/routes/journal.ts), [account.ts](../apps/api/src/routes/account.ts) |
| `apps/api/src/auth/` | Clerk token verification, the `azp` policy, session middleware, Clerk account deletion | [session.ts](../apps/api/src/auth/session.ts), [azp.ts](../apps/api/src/auth/azp.ts) |
| `apps/api/src/services/` | Environment validation, user provisioning, catalog and search, journal transactions, friendships and friends-only list access, account data deletion, health. Framework-free; expected failures throw `AppError` | [journal.ts](../apps/api/src/services/journal.ts), [provisioning.ts](../apps/api/src/services/provisioning.ts) |
| `apps/api/src/domain/` | API-only pure rules: course identity, OpenGolfAPI parsing, row-to-course views, the username rule, friendship transitions | [identity.ts](../apps/api/src/domain/identity.ts) |
| `apps/api/src/db/` | Drizzle schema, committed SQL migrations, seed data, migration runner | [schema.ts](../apps/api/src/db/schema.ts), [migrate.ts](../apps/api/src/db/migrate.ts) |
| `apps/api/scripts/` | Contract emitter, seed builder, Supabase import | [emit-openapi.ts](../apps/api/scripts/emit-openapi.ts), [plan.ts](../apps/api/scripts/import/plan.ts) |
| `packages/domain/src/` | Pure rules both sides run: course model, geography, ranking selectors, list reorder, shared types | [course.ts](../packages/domain/src/catalog/course.ts), [reorder.ts](../packages/domain/src/journal/reorder.ts) |
| `apps/web/app/lib/api/` | The typed API client (generated `schema.d.ts`, bearer tokens, `ApiError`), contract-to-domain mappers, the slow-server notice | [client.ts](../apps/web/app/lib/api/client.ts), [mappers.ts](../apps/web/app/lib/api/mappers.ts) |
| `apps/web/app/root.tsx`, `routes.ts`, `routes/` | Document shell with `ClerkProvider`, route configuration, per-route `clientLoader`/`clientAction` and pages | [root.tsx](../apps/web/app/root.tsx), [journal.ts](../apps/web/app/routes/journal.ts) |
| `apps/web/app/features/<feature>/` | Pages, dialogs and hooks for catalog (Courses), journal (the Ranking tab's editor), rounds, friends, social (Home feed, profiles, timelines), the navigation shell and auth | [JournalPage.tsx](../apps/web/app/features/journal/JournalPage.tsx), [LogRoundDialog.tsx](../apps/web/app/features/rounds/LogRoundDialog.tsx) |
| `apps/web/app/shared/` | Modal, StateSelect, RouteError, SafeStorage, geolocation, error formatting, `useActionFetcher`, country data, `legacy.css` | [Modal.tsx](../apps/web/app/shared/ui/Modal.tsx), [storage.ts](../apps/web/app/shared/lib/storage.ts) |
| `tests/e2e/` | Playwright user flows against the built API and web app | [course-book.spec.ts](../tests/e2e/course-book.spec.ts) |

In the web app, feature folders are the organizational unit; avoid global `components/` folders that scatter one feature across the project.

## Request flow

1. A client obtains a Clerk session token (`getToken()` in the web app; the Clerk iOS and Android SDKs in the apps) and sends it as `Authorization: Bearer <token>`. The web client sends no token to public operations and never sends cookies (`credentials: "omit"`).
2. The API's session middleware treats a request with no Authorization header as anonymous without calling Clerk. With a header it verifies the token (`authenticateRequest`, local `CLERK_JWT_KEY` when set) and applies the `azp` policy; a token that does not verify is a 401, never a silent downgrade.
3. Secured operations (those with `security` in the contract) pass through `memberOnly` before input validation, so an anonymous request is a 401 rather than a 400. The handler's `requireUser` provisions the member's `users` row from the token claims (cached a minute per user) and rejects deleted accounts.
4. The route validates parameters and bodies against the contract schemas, calls one service, and maps the result to contract shapes. Every list change runs in one transaction under the member's advisory lock and returns the whole updated list read in that transaction.
5. Failures return the envelope `{ error: { code, message, requestId, fields } }` with a stable `code`. Unexpected errors are logged with the request id and reported as `internal`.
6. In the web app, route `clientLoader`s fetch page data and route `clientAction`s perform changes (`/journal` for list and round changes, `/friends` for friend requests); React Router reloads the page's loaders after each change, so pages never keep a second copy of server data.

API operations are listed in [api.md](api.md); the contract is authoritative.

## Where state belongs

| State | Place |
| --- | --- |
| Open dialog, form fields, selected filter, temporary loading/error state | Component state |
| Account, memberships, rounds, friendships, courses, rankings | Postgres, owned by the API; clients read them through the API on every load |
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
| `friendships` | One row per pair of members, whoever asked (unique index on the unordered pair): `requester_id`, `addressee_id`, `status` pending or accepted. Changes to a pair hold both members' locks, so crossing requests become one friendship. Rows cascade with their users and are removed when either member deletes their account. |

Play count is always `COUNT(rounds)`; there is no stored counter. All list changes take the member lock, `pg_advisory_xact_lock(hashtext(user_id))` ([member-lock.ts](../apps/api/src/services/member-lock.ts)), so concurrent moves, logs and account deletion serialize. Friendship changes take both members' locks, in key order so overlapping pairs cannot deadlock, and recheck that both accounts are active inside the transaction. A request queued before account deletion cannot recreate the deleted member's relationships.

The seed migration (`0001_seed_catalog.sql`) carries the retired project's public catalog with original UUIDs, 281 bundled stable ids matched through the identity rules, and 24 bundled world-list courses the catalog lacked. Two bundled entries are duplicates of other bundled entries and carry no stable id. The catalog itself contains 13 pre-existing same-name, same-location duplicate pairs; the stable id went to the ranked or richer row, and merging duplicates is a separate data task. Services take a `Database` argument (`apps/api/src/db/client.ts`) so tests can pass the test database.

## Data rules

- **Counts:** the number of round rows is the play count. Never synthesize rounds from a count.
- **Order:** published rankings and personal rank are separate. Logging, count edits and adds never change an existing membership's rank. Only a move renumbers, and it renumbers the complete list from the full order so courses hidden by a filter keep their positions (`reorder()` in `packages/domain/src/journal/reorder.ts`).
- **Adding a catalog course** (`PUT /v1/me/courses/{courseId}`): add the membership at the bottom if missing and log one round when the course has none. Repeating it changes nothing. The web app no longer calls it: its "Add to my list" buttons logged a round dated today, so course rows now offer Log a round (with a date) and Want to play instead. The operation stays in the contract.
- **Adding by details** (`POST /v1/me/courses`): resolve or create the course, place it at `rank` (clamped to [1, N+1], bottom when omitted) if it is new to the list, and log `quantity` rounds (default 1) on `playedOn`. `source: manual` marks a shared custom course. A U.S. course needs a resolvable state (`us_state_required`).
- **Logging** (`POST /v1/me/courses/{courseId}/rounds`): add the membership at the bottom if missing and log `quantity` rounds sharing one date. Clients send the member's local date; the server's date is UTC. The response carries the new `roundIds`: the web's Undo deletes exactly those, so undoing a course's first round takes it off the list again. Rounds can also be deleted from the member's own ticks on list rows (round history) and from their own timeline.
- **Counts and deletes:** setting the play count diffs against actual rounds (delete the oldest surplus so the newest history is kept, insert shortfall), as the original application did; zero deletes the membership. Deleting the last round deletes the membership. Deleting a course deletes the membership and cascades its rounds. All of these renumber remaining ranks.
- **Identity:** resolve a course through `identity.ts` before creating a row: explicit uuid, alias to `stable_id`, canonical Scottish geography, then `name_key` plus country with an exact normalized-location match, else insert under an advisory lock on `name_key`. External search ids are never stored as course ids.
- **Search:** `GET /v1/course-search` searches the stored course names directly by default (case-insensitive, every whitespace-separated term, literal `%` and `_`). Results include shared custom courses and carry their catalog uuid. The service reads matching rows and ranks, then the pure ordering/paging functions return ten alphabetically by name, location and id with `page`, `pageSize` and `total`. Existing catalog rows are not merged. This small-catalog implementation reads all matches; revisit database-side ordering/pagination and substring indexes when catalog size warrants it.
  - The dialog offers **Search more courses**, which explicitly requests `source=external`. OpenGolfAPI matches are resolved against the catalog so known courses carry their uuid; other hits carry only their details. All upstream pages are read within one timeout before resolving, deduplicating, ordering and paging. If REST fails or returns incomplete/repeated pages, the complete matching CSV dataset is searched (parsed once per process). Both failing is `search_unavailable`; catalog search remains independent.
  - The dialog fetches each page anew, offers Previous/Next, and resets to catalog page one when the query changes. See the [catalog-first search decision](../.planning/decisions/2026-10-05-catalog-first-course-search.md).
- **Top lists** (the Courses page and `/u/:username/lists/:list`): progress counts the whole list, before filters and search. The national lists render only with 100 unique ranks; state lists need a state and at least one row.
  - "World" is GOLF Magazine's Top 100 Courses in the World (ranking type `global`, migration 0005), which ranks every country together. "International" is Golf Digest's World 100 (type `world`), which leaves out the US. The USA and USA Public lists are Golf Digest's. Each list's source and year are on its `course_rankings` rows ([decision](../.planning/decisions/2026-09-30-whole-world-top-100-from-golf-magazine.md)).
  - `listTopLists` and `getTopList` add friends' progress: counts are the courses on each member's list by id, friends are accepted and active, and a friend appears on a list only once they have played something on it (`domain/top-lists.ts`).
  - A release skips list types it does not know (`rankSummaries`), so a migration that adds one never shows the new ranks as state ranks while the previous release still serves.
  - The Courses page shows the list in `?list=` (`world`, `usa`, `usa-public`, `international`, `state-mi`), else the tab last used on the device, else the World Top 100. Best in State uses the chosen state, else the state whose list the member has played most of. Members load the list with `getTopList` (their rounds, Want to play, and the friends who played each course, plus friends' progress); visitors get the public rankings. Each row shows the course's rank on every list it is on (`rankBadges`).
- **My List:** geographic filters are read-only (no drag or count editing); text search keeps editing.
- **Friends** ([decision](../.planning/decisions/2026-09-29-friends-only-visibility-with-mutual-friend-requests.md)): a member sees their own list and their friends' lists read-only, and no one else's; another member's list is 404 whether or not they exist. Friendships are mutual (request, then accept; either side can end it). Members find each other by username search (3+ characters, username and display name only). The imported members start as friends with each other; new sign-ups start with none. Usernames match case-insensitively. Responses never include email addresses or user ids.
- **Profiles, timelines and the feed** ([decision](../.planning/decisions/2026-09-29-social-redesign-top-lists-profiles-timelines-and-star-ratings.md)):
  - All three are read-only and follow the Friends rule: the viewer or an accepted friend, anyone else 404. The shared check is `visibleMember` in `services/friends.ts`.
  - **Profile** (`getMemberProfile`):
    - stats: courses on the list, rounds, rounds dated in the current UTC year, friends;
    - Top Four: personal ranks 1–4;
    - for a friend, a comparison over shared courses (matched like `onMyList`): the share of concordant pairs from three shared courses, and the largest split by percentile position (`compareRankings` in `packages/domain`).
  - **Timeline** (`listMemberRounds`): dates and courses only. Order is `played_at DESC NULLS LAST, created_at DESC, id DESC`. `visit` counts the member's rounds at a course in played order, undated first.
  - **Feed** (`getFeed`): friends' rounds by when they were logged. Rounds logged more than 14 days after they were played (or undated) collapse into one `backfill` item per friend and UTC day. It is derived on read; there is no event table.
  - **Paging:** cursors are opaque keyset keys (`domain/cursor.ts`) that carry timestamps as Postgres text with microseconds, never member ids.
  - **`MemberCourse`** carries the member's `played`, `lastPlayedOn` and the viewer's `myRank`.
- **Want to play** (`listWantToPlay`, `addWantToPlay`, `removeWantToPlay`): each member's wishlist, newest first, readable by the member and their accepted friends (anyone else 404). Adding and removing are idempotent; adding again keeps the original date. A course may be on it after it was played ("play it again"); logging a round there takes it off, in the same transaction (`insertRounds`).
- **Account deletion** (`DELETE /v1/me`): data first, then the Clerk user; a retry after a Clerk failure finishes the job. Details under [Authentication and authorization](#authentication-and-authorization).
- **Preferences:** manual state selection and optional geolocation stay in browser storage.
- **Known data quirk:** the Pinehurst No. 4 alias resolves to the legacy `usa80` record; fixing it is a data change, not a code change.

## Authentication and authorization

Clerk holds credentials, Google sign-in, email verification and sessions. The API trusts only verified session tokens:

- **Verification:** [session.ts](../apps/api/src/auth/session.ts) calls `@clerk/backend` `authenticateRequest` with `acceptsToken: "session_token"`, so pending sessions count as signed out. With `CLERK_JWT_KEY` set, tokens verify locally, with no JWKS fetch after a cold start.
- **Authorized party:** `authorizedParties` is deliberately not passed: since `@clerk/backend` 3.11.1 it rejects every token without `azp`, and native app tokens have none. [azp.ts](../apps/api/src/auth/azp.ts) applies the policy instead: a token with `azp` must come from one of `WEB_ORIGINS`; a token without `azp` is accepted. The API accepts bearer tokens only and ignores cookies, so there is no cross-site request forgery surface.
- **Provisioning:** [provisioning.ts](../apps/api/src/services/provisioning.ts) upserts the `users` row from the token claims (cached a minute per user) and never refreshes a deleted account, so a token that outlives a deletion cannot restore personal data. The product's username rule (`^[A-Za-z0-9_]{3,24}$`) is enforced here (`username_invalid`).
- **Authorization rules:** anonymous clients may read the published rankings and client settings; everything under `/v1/me` and `/v1/members`, and both searches, needs a session; writes act only as the token's member, and friendship writes touch only pairs that include them; a list is visible only to its member and their accepted friends; other members are exposed only as username and display name. [contract.test.ts](../apps/api/src/contract/contract.test.ts) proves every secured operation rejects anonymous calls.
- **Account deletion:** `DELETE /v1/me` removes the list, rounds, friendships and friend requests, detaches created courses and tombstones the `users` row in one locked transaction, forgets the cached user, then deletes the Clerk user (a 404 counts as done). It keys on the session's Clerk id and never provisions, so a member whose Clerk username breaks the product rule can still delete their account; a member with no row yet gets a tombstone too. If Clerk fails, the API answers 502 `account_deletion_incomplete` and a retry goes straight to Clerk. The web Account page is also the deletion link Google Play requires.

Clerk dashboard configuration the code assumes:

- User & authentication: username required, first name required, email required, Google enabled.
- Sessions, customize session token: `{"username": "{{user.username}}", "email": "{{user.primary_email_address}}", "name": "{{user.full_name}}", "image_url": "{{user.image_url}}"}`. Without it, provisioning fetches the user from the Backend API.
- Account deletion by members is done through the app; turn off Clerk's self-service account deletion so it cannot bypass the API.
- API keys: the JWT public key goes into the API's `CLERK_JWT_KEY`.
- Production instance: DNS records on coursebook.golf, the project's own Google OAuth client, and later Sign in with Apple for the iOS app (App Store rule 4.8).

The web account dialog ([AuthDialog.tsx](../apps/web/app/features/auth/AuthDialog.tsx)) keeps the legacy modal chrome and ids and renders Clerk's `SignIn` with hash routing and `withSignUp`, Clerk's sign-in-or-up flow: an email or Google account with no member behind it creates one, and Clerk asks for the missing username in the same dialog. Google returns to the page the dialog was opened on with Clerk's step in the hash (`#/create/sso-callback` for a new account), so the layout opens the dialog when a page loads with a `#/` hash and clears the hash when it closes ([clerk-flow.ts](../apps/web/app/features/auth/clerk-flow.ts)). `/sign-in/*` (also `withSignUp`) and `/sign-up/*` serve direct links and Clerk's own redirects; `ClerkProvider`'s `signInUrl`/`signUpUrl` point Clerk at them instead of its hosted pages. One step still falls back to the instance's configured sign-up page: `#/create/continue` loaded with no sign-up in progress. `ClerkProvider` sits in the root `Layout`, not `App`, because route `clientLoader`s await `getToken()` before `App` renders.

## Contract and clients

The contract grows only; its rules (named schemas, always-present response fields, `.nullish()` request fields, error codes as documented strings) are in [contract/README.md](../contract/README.md) and enforced by `contract.test.ts`. The web app's types are generated from it (`pnpm contract:emit`), and CI fails when the committed contract or types are stale. Clients read `GET /v1/client-config` at launch; its minimum versions are how installed app builds are told to update.

## Types and boundaries

[course.ts](../packages/domain/src/catalog/course.ts) defines the domain course model with Zod; Drizzle infers row types from `apps/api/src/db/schema.ts`; the contract defines the wire shapes. Keep the three separate: mappers in `apps/api/src/contract/mappers.ts` and `apps/web/app/lib/api/mappers.ts` are the only places that know two of them.

Validate untrusted input at boundaries: request parameters and bodies (contract schemas), environment variables at startup ([env.ts](../apps/api/src/services/env.ts)), external API responses, and token claims. Use `unknown` until validated. In the web app, [errors.ts](../apps/web/app/shared/lib/errors.ts) formats errors and `RouteError` shows a failed page load with Retry inside the layout. Noncritical failures (geolocation, search fallback) log and degrade; failed mutations show a visible failure and leave controls usable.

## Hosting and operations

- **Cold starts:** a free web service sleeps after 15 idle minutes and takes up to about a minute to wake (Render's figure; 12.5 s measured on staging, 2026-09-28); the web app shows "Waking the server…" when a request is slow and waits up to 90 seconds. The static site never sleeps. Before the native apps ship, the API moves to a paid plan so phones never wait.
- **Migrations** run in the API process before it listens (free plans have no pre-deploy step), under a session advisory lock, so an overlapping deploy migrates once. Migrations must stay backward-compatible with the previous release, which keeps serving while the new one starts.
- **Per-process caches:** the catalog snapshot (10 minutes, invalidated after a course is created), the search dataset and the provisioning cache assume one API instance; correctness never depends on them.
- **Logs:** one JSON line per API request with its request id, which also appears in every error envelope and the `X-Request-Id` header. Server-side failures (unexpected errors and 5xx `AppError`s) are also logged with the request id and their cause; 4xx errors are not.
- **Account lifecycle:** delete members only through the API (`DELETE /v1/me`: the Account page, or an admin acting as the member), never in Clerk's dashboard. Deleting only the Clerk user leaves a member row that no one can sign in to or remove, and provisioning has no reconciliation for it. Keep Clerk's self-service account deletion off for the same reason.
- **Known data issue, kept as-is:** the canonical-location table in `apps/api/src/domain/identity.ts` matches on normalized names, so "The Glen Club" in Glenview, IL (Illinois list #32) shows as North Berwick, Scotland. The old app had the same table. It is left unchanged until the maintainer decides; see the [import decision](../.planning/decisions/2026-09-28-import-supabase-member-data-1-for-1.md) for this and the duplicate catalog rows members carry over.
- **Friends list:** the Friends page loads every page of `GET /v1/members` (the member's friends, 200 each) on each visit. Fine at today's size; page it if members gather hundreds of friends.

## Appearance

The web app is mid-redesign ([decision](../.planning/decisions/2026-09-29-social-redesign-top-lists-profiles-timelines-and-star-ratings.md)).

- **Redesigned screens** style themselves with colocated CSS modules. These are the navigation (`features/shell`), Home, profiles and Friends (`features/social`, `features/friends`), and the Courses page and member Top lists (`features/top-lists`). They use the `legacy.css` `:root` tokens (`--bg`, `--panel`, `--cream`, `--gold`, …) and its Playfair Display and DM Sans fonts. Modules keep their class names local, because `legacy.css` styles bare `header`, `nav`, `main` and generic classes such as `.card`, `.avatar` and `.stat`. Join module classes with `cx()` (`shared/lib/cx.ts`): lookups are `string | undefined` under `noUncheckedIndexedAccess`.
- **Screens not yet redesigned** keep their markup, element ids and `legacy.css`: Account, Privacy, and the Ranking tab's editor and dialogs. The stylesheet preserves what Chromium parsed from the original page, including rules the browser ignored, so broad cleanup changes appearance.
- **Routes:**
  - `/` is Home (the friends feed, or a welcome when signed out).
  - `/courses` is the published Top lists; `/top-100` redirects there.
  - `/u/:username` is a profile, with tabs for Timeline (index), Ranking, Lists and Stats. The member's own Ranking tab is the list editor, and `?log=1` opens the Log dialog. `/u/:username/lists/:list` (`usa`, `usa-public`, `world`, `state-mi`, …) is one Top list with the member's ticks and, on a friend's, the viewer's.
  - `/friends` is requests, search and friends; `/friends/:username` redirects to the profile.
  - Phones get a bottom tab bar, and the app container reserves room for it. The root route renders once at build time into `index.html`, so anything that depends on `window`, `document`, `localStorage` or the viewport runs in an effect.

## Cutover

The retired Supabase project is read-only for this repository, apart from the approved write freeze during cutover. [cutover.md](cutover.md) is the step-by-step runbook: Render staging from the branch, the Clerk production instance, an import rehearsal with `pnpm import:supabase --dry-run` (`apps/api/scripts/import/`: row schemas in `rows.ts`, a ledger that accounts for every exported row in `plan.ts`, writes and verification in `run.ts`; the data is copied 1-for-1 without merging or correction, and any problem stops the import before it writes), the database upgrade, the freeze and real import, the domains, and the switch of `render.yaml` and the deploy to `main`. Keep Supabase paused, not deleted, until a Render database restore has been tested.
