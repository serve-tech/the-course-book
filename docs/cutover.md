# Cutover runbook: GitHub Pages + Supabase to Render + Postgres + Clerk

Each step names who does it and what proves it worked. The retired Supabase project is never modified except for the write freeze in step 4.3 (a reversible privilege change that needs the maintainer's explicit approval at the time); it is exported from, then paused.

The Render footprint is three resources from [render.yaml](../render.yaml): `coursebook-golf-api` (Docker web service), `coursebook-golf-web` (static site) and `coursebook-db` (Postgres). Every non-secret setting (publishable keys, the JWT public key, origins and URLs) is a value in `render.yaml`, so changing one is a commit and a Blueprint sync. The one secret, `CLERK_SECRET_KEY`, is `sync: false`: Render asks for it when the Blueprint is created and ignores it on later syncs, so later changes are made in the dashboard. Staging starts on free plans; step 4 moves the database to a paid plan before real member data goes in.

## 0. Preconditions

- Branch `feat/render-clerk-rebuild` green in CI (verify, browser, docker jobs).
- Clerk development instance exists with the dashboard settings in [architecture.md](architecture.md#authentication-and-authorization); the browser suite has run green against it with the `E2E_` secrets set.
- Domain coursebook.golf registered and DNS editable.

## 1. Render staging from the branch (maintainer)

1. Open `https://render.com/deploy?repo=https://github.com/serve-tech/the-course-book/tree/feat/render-clerk-rebuild` (or in the dashboard: New, Blueprint, connect the repository). Make sure the Blueprint's branch is `feat/render-clerk-rebuild`: `main` has no `render.yaml` until cutover. Render has no API or CLI command that creates a Blueprint, so this step is manual. Render creates the three resources on free plans (no payment method should be needed; Render may still ask for a card to verify the account). Render's GitHub app must have access to the repository: a repository added by its public URL gets no auto-deploys and no Blueprint auto-sync ("Auto-deploys require a connected Git provider", [Render deploys](https://render.com/docs/deploys)), so every push then needs a manual deploy.
2. Render prompts for one value: `CLERK_SECRET_KEY` on `coursebook-golf-api`, the development instance's secret key from `.env`. Everything else comes from `render.yaml`, using the development Clerk instance and the `onrender.com` URLs `https://coursebook-golf-web.onrender.com` (web) and `https://coursebook-golf-api.onrender.com` (API). Service names set these hostnames; if Render ever assigns a suffixed hostname because a name is taken, correct `WEB_ORIGINS`, `PUBLIC_WEB_URL` and `VITE_API_URL` in `render.yaml` and sync.
3. Confirm the API deploy log shows no migration or startup error, and `https://coursebook-golf-api.onrender.com/healthz` returns `{"ok":true}`. On the first staging deploy (2026-09-28) one route chunk returned 404 for about three minutes after the static site reported live, and React Router reloads the page on every failed chunk load, so the page reloaded in a loop until the chunk appeared; it cleared without action. The next deploy served every chunk within 10 seconds and kept serving the previous deploy's chunks. If a loop appears after a deploy, check each `/assets/` file the new manifest references before changing code.
4. Run `pnpm smoke:staging` ([staging-smoke.ts](../tests/e2e/staging-smoke.ts)): a throwaway development-instance user signs in, logs a catalog course and one outside the catalog, reloads, opens Top 100 (100 rows), Friends and a deep link, and deletes the account from the Account page. Reordering (drag) is covered by the browser suite, not the smoke test; check it by hand when it matters.
5. Wait more than 15 minutes, open the site again and time the first data load: expect the "Waking the server…" notice and up to about a minute. Measured 2026-09-28: 12.5 s for the first `/v1/rankings` after 35 idle minutes, 0.27 s warm.

## 2. Clerk production instance (maintainer)

1. Clerk dashboard, create the production instance for the application; add the DNS records Clerk lists for coursebook.golf (CNAMEs for the frontend API, accounts portal and email) and wait for verification.
2. Create the project's own Google OAuth client in Google Cloud Console with Clerk's redirect URI; enter its credentials in Clerk's Google social connection.
3. Apply the same settings as development: username, first name and email required; session token claims `username`, `email`, `name` (`{{user.full_name}}`), `image_url`; self-service account deletion off.
4. Keep the production keys (publishable, secret and JWT public key) ready; do not put them in Render until step 5. The JWT public key is also served, as a JWK, by `GET https://api.clerk.com/v1/jwks` with the secret key.

## 3. Rehearse the import (maintainer + agent)

1. Export from Supabase, from the repository root:
   ```sh
   mkdir -p .import
   psql "$SUPABASE_DB_URL" -1 -v ON_ERROR_STOP=1 \
     -c "set transaction isolation level repeatable read, read only" \
     -c "\copy (select id, email, encrypted_password from auth.users) to '.import/auth_users.csv' csv header" \
     -c "\copy profiles to '.import/profiles.csv' csv header" \
     -c "\copy courses to '.import/courses.csv' csv header" \
     -c "\copy user_courses to '.import/user_courses.csv' csv header" \
     -c "\copy rounds to '.import/rounds.csv' csv header"
   ```
   `-1` runs every command in one transaction, and `repeatable read` makes all five files one consistent snapshot (checked on 2026-09-28: the isolation level holds across the `\copy` commands); `read only` means the export cannot change Supabase. `.import/` at the repository root is gitignored. `auth_users.csv` holds every member's bcrypt password hash, so members keep their passwords: never commit, print or share it, and delete `.import/` once the import is verified (step 4.7).
2. Dry run against the local database: `DATABASE_URL=<local> CLERK_SECRET_KEY=<dev> pnpm import:supabase --dry-run`. The importer ([apps/api/scripts/import/](../apps/api/scripts/import/)) validates every row, then gives every exported row exactly one outcome and prints the totals per table: imported, already in the catalog, or a problem. It copies the data 1-for-1 ([decision](../.planning/decisions/2026-09-28-import-supabase-member-data-1-for-1.md)): nothing is merged or corrected, and any invalid row or problem stops it before it writes, with the file and row or the reason. Read the notices: the changes the new schema forces (ranks renumbered in their existing order, list entries added for courses with only rounds), rounds dated from their creation time, stored `times_played` that differs from the rounds, members without a password. The 2026-09-28 rehearsal: 11 members, 286 list entries and 711 rounds, all imported; 4 members' ranks renumbered.
3. Real run against the local database with the development Clerk instance (creates dev-instance users only). It verifies itself: after writing, every member's list order, ranks and round ids must equal the plan, or it exits non-zero. Run the API and web app locally, sign in as yourself with your old password (hashes are imported, so it works unchanged) and confirm your list and rounds. Rerunning is safe until members use the new site: accounts are found by email and each member's list and rounds are replaced.

## 4. Upgrade the database, freeze and import (maintainer)

1. Move `coursebook-db` to a paid plan before any real data is stored: in `render.yaml` set `plan: basic-256mb` and `diskSizeGB: 1` (otherwise a paid database defaults to 15 GB), commit, and sync the Blueprint. Free Render databases expire 30 days after creation and have no backups. Confirm the data survived the upgrade (the seeded catalog is still there).
2. Announce a short freeze to members.
3. Freeze writes while leaving reads (explicit maintainer approval required; this is the only change ever made to the retired project). The old app writes only through Supabase's REST API as the `anon` and `authenticated` roles, with no stored procedures, so revoking their write privileges stops every write while the site keeps showing data. In the Supabase SQL editor, first save the current grants so the undo restores exactly them:
   ```sql
   select grantee, table_name, privilege_type from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated') order by 1, 2, 3;

   revoke insert, update, delete on public.profiles, public.courses, public.user_courses,
     public.rounds, public.course_rankings from anon, authenticated;
   ```
   Undo, only if the cutover is abandoned: grant back exactly the saved `INSERT`, `UPDATE` and `DELETE` rows.
4. Take the final export (step 3.1) from the frozen, still readable database.
5. Run the import against Render's database using the production Clerk secret key: `DATABASE_URL=<render external url with ?sslmode=require> CLERK_SECRET_KEY=<prod> pnpm import:supabase`. Members are created in Clerk production with their Supabase password (bcrypt hash) and their Supabase id as the external id. Password members sign in with their old password (Clerk emails a one-time code the first time on a new device); Google members use "Continue with Google", which Clerk links to the imported account by email; anyone can use "Forgot password".
6. Confirm it exited 0 and printed `verified: every list, rank and round matches the plan`, with no problems and every table's rows accounted for.
7. Delete `.import/` (it holds password hashes). Only then, and only after the import is verified, pause the Supabase project (Settings, General, Pause). Until then it stays frozen but readable, so a failed import can be re-exported and rerun without resuming a paused project.

## 5. Point the domains and switch to main (maintainer + agent)

1. Add `coursebook.golf` and `www.coursebook.golf` as custom domains on `coursebook-golf-web`, and `api.coursebook.golf` on `coursebook-golf-api`; create the DNS records Render shows and wait for the certificates. (The Hobby workspace includes two custom domains; each additional one is billed.)
2. Switch to the production Clerk instance and the domains in one go, so the API never runs with keys from two Clerk instances: replace `CLERK_SECRET_KEY` on `coursebook-golf-api` in the Render dashboard, then immediately commit one `render.yaml` change with the production `CLERK_PUBLISHABLE_KEY` and `CLERK_JWT_KEY` on the API, the production `VITE_CLERK_PUBLISHABLE_KEY` on the static site, `WEB_ORIGINS=https://coursebook.golf,https://www.coursebook.golf,https://coursebook-golf-web.onrender.com` and `PUBLIC_WEB_URL=https://coursebook.golf` on the API, and `VITE_API_URL=https://api.coursebook.golf` on the static site. Confirm the Blueprint sync applied it and both services redeployed.
3. Move Render from the branch to `main`, in this order, so no service ever tracks a branch without the new code:
   1. Merge `feat/render-clerk-rebuild` into `main`. The services keep deploying from the branch, and `render.yaml` still names it. The retired Pages workflow fails on `main` (it runs `npm ci` and the repository has no `package-lock.json`), so GitHub Pages keeps serving its last deployment.
   2. Point the Blueprint at `main` in the Render dashboard (Render's API cannot change a Blueprint's branch).
   3. In a pull request to `main`, change `branch` in `render.yaml` to `main` for both services and delete `.github/workflows/pages.yml` (both services deploy only when every check on the commit passes, and the retired Pages workflow fails on `main`, so leaving it would block every deploy); after the merge, confirm the Blueprint sync moved both services to `main` and they redeployed (sync manually in the dashboard if it did not).
   4. Only then delete the `feat/render-clerk-rebuild` branch; a service still tracking a deleted branch stops receiving deploys.
   5. Disable GitHub Pages in the repository settings once coursebook.golf serves the Render site.
4. Smoke test on coursebook.golf with a real account: sign in, log a round, reorder, Friends, sign out. Check the API's Render logs for errors (every error response carries a request id that appears in the logs).

## 6. After cutover

- Requirements before the iOS and Android apps ship (release gates, not follow-ups):
  - Move `coursebook-golf-api` to `plan: starter` so apps never wait for a cold start; raise the minimum versions in `/v1/client-config` (`MIN_IOS_VERSION`, `MIN_ANDROID_VERSION`) only when an old app build must stop working.
  - A contract compatibility check in CI against the released contract: commit the contract each app release ships with as a baseline and fail on breaking changes. `pnpm contract:check` only proves the committed file matches today's routes, so a rename that regenerates both still passes.
  - Swift and Kotlin client generation and compilation from `contract/openapi.json` in CI (the spikes proved it once; CI must keep proving it).
  - An `Idempotency-Key` on the round-logging `POST` operations. Today a retry after a lost response logs the rounds again ([api.md](api.md)); phone networks make that likely, and the web benefits too.
  - Sign in with Apple in Clerk (App Store rule 4.8 applies because Google sign-in is offered).
- Keep the Supabase project paused, not deleted, until a Render database restore has been tested from a backup.
- Update the README production link and remove the `onrender.com` origins from `WEB_ORIGINS` once the domains serve all traffic.
- Revoke anonymous access to the retired backup tables on Supabase before it is ever unpaused (separate approval; unrelated to this repository).
