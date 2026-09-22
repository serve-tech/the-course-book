# coursebook.golf

A golf course journal: log rounds, rank the courses you have played, compare against published Top 100 lists and see what other members are playing. Built by Serve Electric with React Router (server rendered), Drizzle over Postgres, Clerk for identity and Docker on Render.

- Repository: https://github.com/serve-tech/the-course-book
- Production: https://serve-tech.github.io/the-course-book/ (retired static build, still live until cutover); coursebook.golf will point at Render after cutover.

## Working on the project

Start with [CONTRIBUTING.md](CONTRIBUTING.md). Agents must follow [AGENTS.md](AGENTS.md), which points to the [architecture guide](docs/architecture.md) and [testing guide](docs/testing.md). Claude and GitHub Copilot entry points refer to the same instructions so conventions stay in one place.

## Development

Use Node 24 (`.nvmrc`) and pnpm (`packageManager` in `package.json`).

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm dev` serves http://localhost:5173/. `pnpm start` runs the production server bundle from `build/`, which is what the Docker image runs.

## Organization

- `app/root.tsx`, `app/routes.ts`, `app/routes/`: document shell, route configuration and route modules (loaders, actions, pages).
- `app/server/`: server-only modules (`*.server.ts`) for environment, database access, authentication, authorization, catalog, search and journal transactions.
- `app/db/`: Drizzle schema, committed SQL migrations, seed data and the migration runner.
- `app/features/<feature>/`: pure domain logic and components for catalog, journal, rounds, friends and auth, with colocated tests.
- `app/shared/`: shared UI primitives, guarded browser storage, geolocation, geographic data and the preserved stylesheet.
- `scripts/`: the seed builder and, once written, the data import script.

## Rebuild status

The application is being rebuilt on the branch `feat/render-clerk-rebuild` per [the decision record](.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md). The [architecture guide](docs/architecture.md#rebuild-status) lists which phases have landed. Until cutover, `main` continues to deploy the retired static application to GitHub Pages.

## Deployment and data

`render.yaml` is the Render Blueprint: one Docker web service (`Dockerfile`, Starter plan) and one Postgres 17 database, both in Oregon. Secret values (`CLERK_SECRET_KEY`, `CLERK_PUBLISHABLE_KEY`) are entered in the Render dashboard; the database URL is wired from the database resource; `NODE_ENV` is set by the Blueprint and `PORT` by Render. Migrations run as the service's pre-deploy command (`node app/db/migrate.ts`) inside the built image. Create or update the infrastructure by syncing the Blueprint from the Render dashboard, never by hand-creating services. The service deploys from the branch named in the Blueprint (`feat/render-clerk-rebuild` until cutover, then `main`).

Local check of the production image:

```sh
docker build -t coursebook-golf:local .
docker run --rm -p 3000:3000 -e PORT=3000 -e DATABASE_URL=... -e CLERK_PUBLISHABLE_KEY=... -e CLERK_SECRET_KEY=... coursebook-golf:local
```

The original data lives in the retired Supabase project until it is exported by the maintainer and imported into Postgres by `scripts/import-supabase.ts` (see the [cutover plan](docs/architecture.md#cutover)). The Supabase project is never modified by this repository and is paused, not deleted, after cutover.

Historical reports: [Supabase port](docs/port-2026-09-17.md), [Incubator migration](docs/incubator-migration-2026-09-18.md), [React migration notes](docs/react-migration.md). They describe retired infrastructure and are not current instructions.
