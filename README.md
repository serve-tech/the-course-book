# The Course Book

A golf journal and course-ranking app maintained by Serve Tech.

- Live app: https://serve-tech.github.io/the-course-book/
- Repository: https://github.com/serve-tech/the-course-book
- Supabase: Mike Ribbing's **Top100Golf**, project `zcblgnjfdrdccbpgmhzr`, in the **Scotland 2027** organization.

## Run locally

The app is a static `index.html` file with inline CSS and JavaScript. No build step or package installation is required.

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. The checked-in configuration connects to the production Supabase project; signed-in changes affect live data.

## Deployment and configuration

GitHub Pages publishes the repository root on `main`. Pushing changes to `main` updates the live app. `.nojekyll` keeps deployment as plain static files.

`index.html` contains the Supabase project URL, browser-safe publishable key, and authentication redirect URL. The publishable key is intentionally public; database permissions and row-level security control access. Never put Supabase secret or service-role keys in this repository.

Supabase authentication must use the live app URL as its site URL and allow it as an email-confirmation redirect destination.

## Port scope

This repository preserves the existing application and Git history from [ribbingmike33/Top100Golf](https://github.com/ribbingmike33/Top100Golf). The frontend is hosted by Serve Tech and currently connects to the original Supabase backend. It does not migrate the frontend to React or move hosting to Render.


## Current backend

The app uses Mike Ribbing's original Supabase project. Both Mike's original site and this site share accounts, courses, rankings, and round history; changes through either site affect the same data. Members use their existing email and password and may need to sign in again after the backend switch.

The original project's allowed authentication redirects include this site's GitHub Pages URL. Its original default site URL and SMTP configuration remain in place.

The Serve Electric copy was deleted after deployment and data verification. **Serve Electric Incubator** exists but remains empty; a separate backend there is deferred until billing is arranged. The schema in `supabase/migrations/` records the earlier copy and is not automatically applied to the original backend.

See [the current backend decision](.planning/decisions/2026-09-17-restore-original-backend.md). The [initial port report](docs/port-2026-09-17.md) is historical.

## Verification

Run the authentication regression tests with Node.js:

```sh
node --test tests/auth.test.mjs
```

The tests stub the external Supabase client and exercise the actual submit handler without contacting production.
