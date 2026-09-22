# Contributing to coursebook.golf

You can describe the change you want without designing the implementation. Repository agents should read [AGENTS.md](AGENTS.md) automatically when their tool supports it; the Claude and GitHub Copilot instruction files point to the same rules. A tool that does not load repository instructions needs AGENTS.md supplied as its entry point.

## For the person requesting a change

Describe the user-visible outcome, the screen it affects and how you will recognize success. For a bug, include the steps to reproduce and expected behavior. You do not need to prescribe folders, routes or testing conventions.

For example: "On My List, let me filter by country while keeping my saved personal order. Clearing the filter should restore the complete list."

The agent should inspect existing behavior, implement on a branch, add appropriate tests, update relevant docs and report verification. It should preserve behavior outside your requested change. Ask it to explain any proposed change to stored data or product behavior before that change proceeds.

Before approving a PR, look for a plain-language description of the outcome, relevant screenshots for UI changes, passing verification, and any untested behavior. You do not need to review every line to ask for that evidence. Automated checks reduce risk; they do not prove every live workflow.

## Set up locally

Use Node 24 through the checked-in `.nvmrc` and pnpm through the `packageManager` field (Corepack or a global pnpm both work):

```sh
nvm use
pnpm install --frozen-lockfile
cp .env.example .env
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Open http://localhost:5173/. `docker compose up -d db` starts the local Postgres (host port 5433) with a development and a test database; `pnpm db:migrate` applies the committed migrations, including the seeded course catalog and published rankings. Fill `.env` with your Clerk development-instance keys before working on anything that signs in.

Schema changes: edit `app/db/schema.ts`, run `pnpm db:generate --name <change>` to produce a migration, review the SQL, then `pnpm db:migrate`. Catalog corrections are new migrations; never edit an applied one. `pnpm seed:build <migration.sql>` regenerates the seed from the retired project's public data and is only for rebuilding that one migration before it has been applied anywhere.

Local development never connects to production data. Automated tests use the local test database and mocked external services.

## Make a change

1. Start from current `main` (or the rebuild branch while the rebuild is in progress) on a descriptive `feat/`, `fix/` or `hotfix/` branch.
2. Read [agent instructions](AGENTS.md), [architecture](docs/architecture.md) and the relevant existing feature/tests.
3. Identify the behavior to preserve and the acceptance checks for the requested change.
4. Keep feature code together. Extract pure logic and test it; put database work in `app/server/` modules and expose it through loaders and actions.
5. Run the checks in [testing](docs/testing.md), review the diff and update documentation affected by the change.
6. Commit logical units with Conventional Commits, push the branch and open a PR against `main`. Include what changed, why, test results and remaining limitations.

Avoid "cleanup" of course identities, rank semantics or migration history alongside unrelated UI work. These have data implications explained in the architecture guide.

## Preview and release

`pnpm build` produces `build/` (client assets and the server bundle); `pnpm start` serves it the way the Docker image does. The Dockerfile and `render.yaml` describe the production build and infrastructure.

Render deploys from the branch named in `render.yaml`. During the rebuild that is `feat/render-clerk-rebuild`, which acts as the staging deployment; at cutover it becomes `main`. Until cutover, `main` still publishes the retired static application to GitHub Pages through `pages.yml` and is frozen to hotfixes.

**Check the PR's "Verify application" result before an authorized merge.** Failed verification must not be merged.

## Where to find answers

| Question | Reference |
| --- | --- |
| What must my agent follow? | [AGENTS.md](AGENTS.md) |
| Where should a change go? | [Architecture](docs/architecture.md) |
| What data rules must hold? | [Data rules](docs/architecture.md#data-rules) |
| What checks should run? | [Testing](docs/testing.md) |
| Which backend is current? | [README](README.md#deployment-and-data) |
| Why was a design chosen? | [Decision records](.planning/decisions/) |
