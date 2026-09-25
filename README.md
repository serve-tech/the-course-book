# coursebook.golf

A golf course journal: log rounds, rank the courses you have played, compare against published Top 100 lists and see what other members are playing. Built by Serve Electric: a JSON API (Hono, Drizzle over Postgres, Clerk) and a React Router web app, on Render; native iOS and Android apps will use the same API.

- Repository: https://github.com/serve-tech/the-course-book
- Production: https://serve-tech.github.io/the-course-book/ (retired static build, still live until cutover); coursebook.golf will point at Render after cutover.

## Working on the project

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Agents must follow [AGENTS.md](AGENTS.md), which points to the [architecture guide](docs/architecture.md) and [testing guide](docs/testing.md). Claude and GitHub Copilot entry points refer to the same instructions so conventions stay in one place.

## Development

Use Node 24 (`.nvmrc`) and pnpm (`packageManager` in `package.json`).

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env   # then add your Clerk development keys (CLERK_* and VITE_CLERK_PUBLISHABLE_KEY)
docker compose up -d db
pnpm db:migrate
pnpm dev
```

`pnpm dev` runs the API on http://localhost:3001 and the web app on http://localhost:5173/.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contract:check
pnpm test:e2e
```

## Organization

A pnpm workspace:

- `apps/api`: the JSON API. Contract and routes (`src/contract`, `src/routes`), Clerk token verification (`src/auth`), framework-free services for provisioning, catalog, search, journal transactions, friends and account deletion (`src/services`), API-only rules such as course identity (`src/domain`), Drizzle schema, migrations and seed (`src/db`), and scripts for the contract, seed and Supabase import.
- `apps/web`: the React Router single-page app: routes (`app/routes/`), feature pages and dialogs (`app/features/<feature>/`), the API client (`app/lib/api/`) and shared UI, browser storage, geolocation and the preserved stylesheet (`app/shared/`).
- `packages/domain`: pure rules shared by the API and the web app (course model, geography, ranking selectors, list reorder, shared types).
- `contract/openapi.json`: the published API contract ([rules](contract/README.md), [reference](docs/api.md)).
- `tests/e2e`: the Playwright suite.

## Status

The rebuild and the split into an API with clients live on the branch `feat/render-clerk-rebuild` ([rebuild decision](.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md), [split decision](.planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md)). The [architecture guide](docs/architecture.md#status) says what is open. Until cutover, `main` continues to deploy the retired static application to GitHub Pages.

## Deployment and data

`render.yaml` is the Render Blueprint: the API as a Docker web service (`apps/api/Dockerfile`), the web app as a static site (`apps/web/build/client`) and a Postgres 17 database, all in Oregon and on free plans for staging. Secret and per-environment values (Clerk keys, `WEB_ORIGINS`, `VITE_API_URL`, …) are entered in the Render dashboard; the database URL is wired from the database resource. The API runs its migrations on start. Create or update the infrastructure by syncing the Blueprint from the Render dashboard, never by hand-creating services. Both services deploy from the branch named in the Blueprint (`feat/render-clerk-rebuild` until cutover, then `main`).

Local check of the API image:

```sh
docker build -f apps/api/Dockerfile -t coursebook-api:local .
docker run --rm -p 3001:3001 -e DATABASE_URL=... -e CLERK_PUBLISHABLE_KEY=... -e CLERK_SECRET_KEY=... -e WEB_ORIGINS=http://localhost:5173 coursebook-api:local
```

The original data lives in the retired Supabase project until it is exported by the maintainer and imported into Postgres with `pnpm import:supabase` (see the [cutover runbook](docs/cutover.md)). The Supabase project is never modified by this repository and is paused, not deleted, after cutover.

Historical reports: [Supabase port](docs/port-2026-09-17.md), [Incubator migration](docs/incubator-migration-2026-09-18.md), [React migration notes](docs/react-migration.md). They describe retired infrastructure and are not current instructions.
