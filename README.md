# The Course Book

A golf journal and course-ranking app maintained by Serve Tech.

- Live app: https://serve-tech.github.io/the-course-book/
- Repository: https://github.com/serve-tech/the-course-book
- Supabase: **The Course Book**, project `naawqzwvegqbhioqqzkh`, in **Serve Electric Incubator**.

## Run locally

The app is a static `index.html` file with inline CSS and JavaScript. No build step or package installation is required.

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. The checked-in configuration connects to the production Supabase project; signed-in changes affect live data.

## Deployment and configuration

GitHub Pages publishes the repository root on `main`. Pushing changes to `main` updates the live app. `.nojekyll` keeps deployment as plain static files.

`index.html` contains the Supabase project URL, browser-safe publishable key, and authentication redirect URL. The publishable key is intentionally public; database permissions and row-level security control access. Never put Supabase secret or service-role keys in this repository.

The live app URL is the final project's Auth site URL and allowed email-confirmation redirect destination.

## Port scope

This repository preserves the existing application and Git history from [ribbingmike33/Top100Golf](https://github.com/ribbingmike33/Top100Golf). The frontend is hosted by Serve Tech and connects to the Serve Electric Incubator backend. It does not migrate the frontend to React or move hosting to Render.


## Current backend

The Incubator project contains the copied accounts, passwords, courses, rankings, and round history. Members sign in again with their existing email and password. Resend SMTP is configured with the approved existing credential. Mike's original Top100Golf project is paused and intact; the Serve Electric staging copy remains available as a fallback.

`supabase/migrations/` contains the baseline actually applied to the Incubator project. The retired project's baseline is archived under `docs/archive/`, outside the migration deployment directory. The original project's production Git synchronization is disabled; the Incubator project currently uses manual database migrations. GitHub Pages still deploys automatically from `main`.

See [the Incubator migration decision](.planning/decisions/2026-09-18-move-to-serve-electric-incubator.md) and [verification report](docs/incubator-migration-2026-09-18.md). Earlier port and rollback reports are historical.

## Verification

Run the authentication and migration-history regression tests with Node.js:

```sh
node --test tests/*.test.mjs
```

The auth tests stub the external Supabase client and exercise the actual submit handler; migration tests cover the historical mismatch and pending-SQL detection. Unit tests do not contact production.

Before any future database deployment, set `SUPABASE_ACCESS_TOKEN` securely in your environment and run:

```sh
node scripts/check-migration-history.mjs
```

This separate live check derives the target from `index.html` and reads its migration ledger. It reports missing local versions or pending SQL and makes no database changes. A mismatch requires reviewing the target and intended migrations before deployment; do not repair a live migration ledger merely to silence an error.
