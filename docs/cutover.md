# Cutover runbook: GitHub Pages + Supabase to Render + Postgres + Clerk

Each step names who does it and what proves it worked. The retired Supabase project is never modified; it is exported from, then paused.

## 0. Preconditions

- Branch `feat/render-clerk-rebuild` green in CI (verify, browser, docker jobs).
- Clerk development instance exists with the dashboard settings in [architecture.md](architecture.md#authentication-and-authorization); the browser suite has run green against it at least once with the `E2E_` secrets set.
- Domain coursebook.golf registered and DNS editable.

## 1. Render staging from the branch (maintainer)

1. In the Render dashboard, New, Blueprint, connect the repository, pick `render.yaml`. Render creates `coursebook-db` and the `coursebook` web service from the branch named in the file.
2. Enter `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` (development instance for now) when prompted.
3. Confirm the deploy: pre-deploy migrations succeed in the deploy log, `https://<service>.onrender.com/healthz` returns `{"ok":true}`, Top 100 shows complete lists (seeded catalog), sign-up and sign-in work with a throwaway account, logging a round and reordering persist across reload.

## 2. Clerk production instance (maintainer)

1. Clerk dashboard, create the production instance for the application; add the DNS records Clerk lists for coursebook.golf (CNAMEs for the frontend API, accounts portal and email) and wait for verification.
2. Create the project's own Google OAuth client in Google Cloud Console with Clerk's redirect URI; enter its credentials in Clerk's Google social connection.
3. Apply the same user settings as development: username, first name and email required; session token claims `username`, `email`, `name`, `image_url`.
4. Keep the production keys ready; do not enter them in Render until step 5.

## 3. Rehearse the import (maintainer + agent)

1. Export from Supabase (read-only):
   ```sh
   psql "$SUPABASE_DB_URL" -c "\copy profiles to '.import/profiles.csv' csv header" \
     -c "\copy courses to '.import/courses.csv' csv header" \
     -c "\copy user_courses to '.import/user_courses.csv' csv header" \
     -c "\copy rounds to '.import/rounds.csv' csv header"
   ```
   `.import/` is gitignored. Never commit it.
2. Dry run against the local database: `DATABASE_URL=<local> CLERK_SECRET_KEY=<dev> pnpm import:supabase --dry-run`. Review unmatched profiles, merged duplicates and orphan counts.
3. Real run against the local database with the development Clerk instance (creates dev-instance users only); sign in as an imported member locally and confirm their list and rounds.

## 4. Freeze and import (maintainer)

1. Announce a short freeze to members; pause the Supabase project (Settings, General, Pause). This stops writes without deleting anything.
2. Re-export (step 3.1) so the snapshot is final.
3. Run the import against Render's database using the production Clerk secret key: `DATABASE_URL=<render external url with ?sslmode=require> CLERK_SECRET_KEY=<prod> pnpm import:supabase`. Existing members are created in Clerk production without passwords; they sign in with Google or "Forgot password".
4. Verify the printed counts against the export row counts and that no member has non-contiguous ranks.

## 5. Point the domain and switch to main (maintainer + agent)

1. Enter the production Clerk keys in Render; redeploy.
2. Add `coursebook.golf` and `www.coursebook.golf` as custom domains on the Render service and create the DNS records Render shows; wait for the certificate.
3. Change `branch` in `render.yaml` to `main`, merge the branch to `main`, delete `.github/workflows/pages.yml` on `main`, and disable GitHub Pages in the repository settings.
4. Smoke test on coursebook.golf with a real account: sign in, log a round, reorder, Friends, sign out. Check Render logs for errors.

## 6. After cutover

- Keep the Supabase project paused, not deleted, until a Render database restore has been tested from a backup.
- Update the README production link and the Clerk redirect allowlist if the onrender.com URL is still referenced anywhere.
- Revoke anonymous access to the retired backup tables on Supabase before it is ever unpaused (separate approval; unrelated to this repository).
