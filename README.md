# The Course Book

A golf journal and course-ranking app maintained by Serve Tech.

- Live app: https://serve-tech.github.io/the-course-book/
- Repository: https://github.com/serve-tech/the-course-book
- Supabase: **The Course Book**, project `pungabwkrqhnxruodurf`, in the **Serve Electric** organization.

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

This repository preserves the existing application and Git history from [ribbingmike33/Top100Golf](https://github.com/ribbingmike33/Top100Golf). This port changes ownership, hosting configuration, and the Supabase connection. It does not migrate the frontend to React or move hosting to Render.


## Migrated backend

The existing accounts, courses, rankings, and round history were copied and verified. Existing users sign in again with the same email and password. The copied database schema is recorded in `supabase/migrations/`.

Custom Resend SMTP is configured using the owner-provided credential and the original sender settings. Configuration read-back and a secure SMTP authentication check passed; no test email was sent.

See [migration details and verification](docs/port-2026-09-17.md) for the snapshot and verification checks.


## Verification

Run the authentication regression tests with Node.js:

```sh
node --test tests/auth.test.mjs
```

The tests stub the external Supabase client and exercise the actual submit handler without contacting production.
