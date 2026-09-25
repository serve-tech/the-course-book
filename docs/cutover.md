# Cutover runbook: GitHub Pages + Supabase to Render + Postgres + Clerk

Each step names who does it and what proves it worked. The retired Supabase project is never modified; it is exported from, then paused.

The Render footprint is three resources from [render.yaml](../render.yaml): `coursebook-api` (Docker web service), `coursebook-web` (static site) and `coursebook-db` (Postgres). Staging starts on free plans; step 4 moves the database to a paid plan before real member data goes in.

## 0. Preconditions

- Branch `feat/render-clerk-rebuild` green in CI (verify, browser, docker jobs).
- Clerk development instance exists with the dashboard settings in [architecture.md](architecture.md#authentication-and-authorization); the browser suite has run green against it with the `E2E_` secrets set.
- Domain coursebook.golf registered and DNS editable.

## 1. Render staging from the branch (maintainer)

1. In the Render dashboard, New, Blueprint, connect the repository, pick `render.yaml`. Render creates the three resources from the branch named in the file, all on free plans (no payment method should be needed; Render may still ask for a card to verify the account).
2. Enter the values Render prompts for:

   | Resource | Variable | Value (development Clerk instance for now) |
   | --- | --- | --- |
   | coursebook-api | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk dashboard, API keys |
   | coursebook-api | `CLERK_JWT_KEY` | Clerk dashboard, API keys, JWT public key (PEM) |
   | coursebook-api | `WEB_ORIGINS` | The static site's URL, e.g. `https://coursebook-web.onrender.com` (no trailing slash) |
   | coursebook-api | `PUBLIC_WEB_URL` | The same URL |
   | coursebook-web | `VITE_API_URL` | The API's URL, e.g. `https://coursebook-api.onrender.com` |
   | coursebook-web | `VITE_CLERK_PUBLISHABLE_KEY` | Same as the API's publishable key |

   If Render assigns different `onrender.com` names than expected, correct `WEB_ORIGINS`, `PUBLIC_WEB_URL` and `VITE_API_URL`, then redeploy both services.
3. Confirm the API deploy log shows no migration or startup error, and `https://<api>/healthz` returns `{"ok":true}`.
4. On the static site: Top 100 shows complete lists (seeded catalog); sign up with a throwaway account; log a round, reorder, and reload to confirm both persist; Friends loads; the Account page deletes the throwaway account.
5. Wait more than 15 minutes, open the site again and time the first data load: expect the "Waking the server…" notice and roughly a minute.

## 2. Clerk production instance (maintainer)

1. Clerk dashboard, create the production instance for the application; add the DNS records Clerk lists for coursebook.golf (CNAMEs for the frontend API, accounts portal and email) and wait for verification.
2. Create the project's own Google OAuth client in Google Cloud Console with Clerk's redirect URI; enter its credentials in Clerk's Google social connection.
3. Apply the same settings as development: username, first name and email required; session token claims `username`, `email`, `name` (`{{user.full_name}}`), `image_url`; self-service account deletion off.
4. Keep the production keys (publishable, secret and JWT public key) ready; do not enter them in Render until step 5.

## 3. Rehearse the import (maintainer + agent)

1. Export from Supabase (read-only), from the repository root:
   ```sh
   psql "$SUPABASE_DB_URL" -c "\copy profiles to '.import/profiles.csv' csv header" \
     -c "\copy courses to '.import/courses.csv' csv header" \
     -c "\copy user_courses to '.import/user_courses.csv' csv header" \
     -c "\copy rounds to '.import/rounds.csv' csv header"
   ```
   `.import/` at the repository root is gitignored. Never commit it.
2. Dry run against the local database: `DATABASE_URL=<local> CLERK_SECRET_KEY=<dev> pnpm import:supabase --dry-run`. Review unmatched profiles, merged duplicates and orphan counts.
3. Real run against the local database with the development Clerk instance (creates dev-instance users only); run the API and web app locally, sign in as an imported member and confirm their list and rounds.

## 4. Upgrade the database, freeze and import (maintainer)

1. Move `coursebook-db` to a paid plan before any real data is stored: in `render.yaml` set `plan: basic-256mb` and `diskSizeGB: 1` (otherwise a paid database defaults to 15 GB), commit, and sync the Blueprint. Free Render databases expire 30 days after creation and have no backups. Confirm the data survived the upgrade (the seeded catalog is still there).
2. Announce a short freeze to members; pause the Supabase project (Settings, General, Pause). This stops writes without deleting anything.
3. Re-export (step 3.1) so the snapshot is final.
4. Run the import against Render's database using the production Clerk secret key: `DATABASE_URL=<render external url with ?sslmode=require> CLERK_SECRET_KEY=<prod> pnpm import:supabase`. Existing members are created in Clerk production without passwords; they sign in with Google or "Forgot password".
5. Verify the printed counts against the export row counts and that no member has non-contiguous ranks.

## 5. Point the domains and switch to main (maintainer + agent)

1. Enter the production Clerk keys: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `CLERK_JWT_KEY` on the API; `VITE_CLERK_PUBLISHABLE_KEY` on the static site.
2. Add `coursebook.golf` and `www.coursebook.golf` as custom domains on `coursebook-web`, and `api.coursebook.golf` on `coursebook-api`; create the DNS records Render shows and wait for the certificates. (The Hobby workspace includes two custom domains; each additional one is billed.)
3. Update the origins: `WEB_ORIGINS=https://coursebook.golf,https://www.coursebook.golf` and `PUBLIC_WEB_URL=https://coursebook.golf` on the API, `VITE_API_URL=https://api.coursebook.golf` on the static site; redeploy both.
4. Change `branch` in `render.yaml` to `main` for both services, merge the branch to `main`, delete `.github/workflows/pages.yml` on `main`, and disable GitHub Pages in the repository settings.
5. Smoke test on coursebook.golf with a real account: sign in, log a round, reorder, Friends, sign out. Check the API's Render logs for errors (every error response carries a request id that appears in the logs).

## 6. After cutover

- Before the iOS and Android apps ship, move `coursebook-api` to `plan: starter` so apps never wait for a cold start; raise the minimum versions in `/v1/client-config` (`MIN_IOS_VERSION`, `MIN_ANDROID_VERSION`) only when an old app build must stop working.
- Keep the Supabase project paused, not deleted, until a Render database restore has been tested from a backup.
- Update the README production link and remove the `onrender.com` origins from `WEB_ORIGINS` once the domains serve all traffic.
- Revoke anonymous access to the retired backup tables on Supabase before it is ever unpaused (separate approval; unrelated to this repository).
