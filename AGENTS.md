# Working on coursebook.golf

These instructions apply throughout this repository. Follow the established patterns without waiting for the user to request them. Extend the existing application; do not use an ordinary feature request as a reason to redesign it.

## Read before editing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [docs/architecture.md](docs/architecture.md) for responsibilities, request flow and data rules.
2. Read [docs/testing.md](docs/testing.md) before changing behavior or tests.
3. Resolve the current Git branch. If present, read its `.planning/STATE-<branch-with-slashes-replaced-by-hyphens>.md`, `.planning/lessons.md`, and relevant decisions/research. Missing local state is normal on a fresh clone.
4. Inspect the nearest existing implementation and its tests before introducing a pattern.

The current code, configuration and active decisions describe today's implementation. Dated documents under `docs/` describe history; do not copy retired hosting, backend or deployment steps from them. If instructions conflict with implementation, investigate and explain the discrepancy instead of guessing.

## Rebuild status

The application was rebuilt from a static Supabase SPA into a server-rendered React Router application per [the rebuild decision](.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md). The retired implementation has been removed from the branch and lives only in Git history. **The application is being split** into a JSON API (`apps/api`), a static web client (`apps/web`) and native iOS and Android clients per [the split decision](.planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md); until that work lands, the web app still renders on the server and calls the API package's services in-process through `apps/web/app/server/backend.server.ts`. Rules below that describe the one-process shape are transitional. Phases still open (browser tests, Docker and Render, data import and cutover) are listed in [docs/architecture.md](docs/architecture.md#rebuild-status). Modules described there as pending do not exist yet; build them in the documented shape rather than inventing an alternative.

## Architecture rules

- Keep React Router framework mode with server rendering, strict TypeScript, Drizzle over Postgres, Clerk for identity, a Docker image as the deploy artifact and Render as the host. There is one Node process serving pages, loaders and actions; there is no separate API service.
- The server owns application data. Loaders read; actions write; both run inside one process against Postgres. Do not add client-side caches, stores or local copies of server state. Browser storage holds only per-device preferences.
- The repository is a pnpm workspace. `apps/api` owns the database (`src/db`: schema, migrations, seed), framework-free services that throw `AppError` (`src/services`) and API-only rules (`src/domain`). `packages/domain` holds pure rules both sides run and may not import frameworks, the database or Node. `apps/web` is organized by feature under `app/features/<feature>/`, with route modules in `app/routes/` and server-only glue in `app/server/` (`.server.ts`). Outside `app/server` the web app reaches the API package only through `app/server/backend.server.ts` (ESLint enforces it).
- Extract parsing, transformation, filtering and ordering into pure functions before wiring routes or I/O. Test those functions directly.
- Every mutation is one database transaction in `apps/api/src/services/`, keyed on the authenticated user from the request context, never on an id supplied by the form. Multi-row list changes take the per-user advisory lock documented in the architecture guide.
- Validate every boundary with the existing Zod approach: form data in actions, environment variables at startup, external API responses, and session claims. Keep application models distinct from Drizzle row types.
- Schema changes ship as Drizzle migration files generated from `apps/api/src/db/schema.ts` and committed with the change. Never edit an applied migration; never use `drizzle-kit push` outside a throwaway local database.
- Components own presentation and transient interaction state. Data arrives through `useLoaderData`; mutations go through `useFetcher` to the journal action. Preserve the existing markup, element ids and `legacy.css`; a visual redesign is a separate, explicitly scoped change.
- Do not introduce a state library, UI framework, second router, alternate package manager, ORM or hosting change incidentally. If a requirement needs an architectural change, explain the tradeoff and record the agreed decision.

## TypeScript and UI conventions

- Use strict types, `unknown` at untrusted boundaries, `import type`, and enums for finite domain modes. Avoid `any`, unchecked casts, non-null assertions and lint/type suppressions as shortcuts.
- Route modules import their generated types from `./+types/<route>`; run `pnpm typegen` (part of `pnpm typecheck`) after adding or renaming a route.
- Use PascalCase component filenames and kebab-case module filenames. Colocate `*.test.ts` or `*.test.tsx`. Use relative ESM imports.
- Prefer explicit, small interfaces. Do not add layers just to match a pattern.
- Reuse `Modal`, `StateSelect` and established CSS classes. Preserve keyboard interaction, labels, mobile layout and visible error/loading states.
- Anything that reads `window`, `document`, `localStorage` or `navigator` runs in an effect or event handler, never during render, so server and client markup match.
- Clean up effects, subscriptions, timers and in-flight requests. Handle stale async responses.
- Check every database and external call for failure. Show actionable failures through existing UI error handling; log noncritical failures when falling back. Never use an empty catch or report success after a failed write.
- Read and write browser preferences through `SafeStorage`.

## Data rules

Read the detailed rules in [docs/architecture.md](docs/architecture.md#data-rules). In particular:

- Play count is the number of round rows for a user and course. There is no stored counter.
- Personal rank is independent of published rankings. Logging a round or editing a count never changes rank. Only an explicit move renumbers, and it renumbers the whole list so filtered-out courses keep their positions.
- A round cannot exist without a membership; the schema enforces it. Deleting the last round deletes the membership.
- Course identity is resolved through `identity.ts` before a course row is created. Keep canonical geography and aliases.
- Any signed-in member may view any member's list read-only. Nothing exposes another member's email address to the browser.
- Custom courses are shared catalog rows visible to everyone.

## Backend and production boundaries

- Local development runs against the docker-compose Postgres and a Clerk development instance. Nothing in local development touches production data.
- Secrets come from `.env` locally (gitignored; copy `.env.example`) and from Render environment variables in production. Never commit a secret key, database URL with credentials, dump or account export. Browser bundles cannot keep secrets; only `CLERK_PUBLISHABLE_KEY` is public.
- `render.yaml` is the source of truth for Render infrastructure. Change services, plans, env var names and health checks there, not in the dashboard. Secret values are set in the dashboard with `sync: false`.
- The retired Supabase project holds the original data until it has been imported and verified. Treat it as read-only: never delete, rewrite or migrate anything there. Exports for import are run by the maintainer and kept outside the repository.
- Before any destructive action, production database change, data deletion, deploy that changes infrastructure, force push or irreversible operation, obtain explicit user confirmation for that action.
- A merge or push to `main` deploys production once cutover is complete. Until then `main` still publishes the retired application to GitHub Pages and is frozen to hotfixes; the rebuild lives on `feat/render-clerk-rebuild`.

## Workflow and completion

- Use pnpm with the committed lockfile and Node from `.nvmrc`; supported versions are in `package.json`. Do not opportunistically upgrade the pinned compiler/linter toolchain.
- Use `feat/`, `fix/` or `hotfix/` descriptive branch names. Preserve unrelated user changes.
- New behavior gets tests; bug fixes get regression tests. Mock external boundaries, not the business logic being tested. Loader and action behavior is tested against the local Postgres, not against mocks of the database.
- Run the checks in [docs/testing.md](docs/testing.md): lint, typecheck, tests and build, plus browser tests for application changes once they exist on the branch. Report anything not run or any unresolved failure accurately.
- Keep docs current in the same change when patterns, commands, configuration or behavior change. Keep these instructions canonical; tool-specific instruction files should point here.
- Use Conventional Commits and commit completed logical units when permitted. Review the diff for unintended changes before pushing.
- Record meaningful architectural decisions in `.planning/decisions/`; keep branch state under 80 lines and local session notes under `.planning/sessions/`. Checkpoint branch state after meaningful decisions or investigations and before handoff. Record actionable lessons after user corrections.
- Final handoff: explain what changed, how it was verified, relevant limitations and the branch/PR. Do not claim production authentication or deployment works solely because local tests pass.
