# Working on coursebook.golf

These instructions apply throughout this repository. Follow the established patterns without waiting for the user to request them. Extend the existing application; do not use an ordinary feature request as a reason to redesign it.

## Read before editing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [docs/architecture.md](docs/architecture.md) for responsibilities, request flow and data rules.
2. Read [docs/testing.md](docs/testing.md) before changing behavior or tests.
3. Resolve the current Git branch. If present, read its `.planning/STATE-<branch-with-slashes-replaced-by-hyphens>.md`, `.planning/lessons.md`, and relevant decisions/research. Missing local state is normal on a fresh clone.
4. Inspect the nearest existing implementation and its tests before introducing a pattern.

The current code, configuration and active decisions describe today's implementation. Dated documents under `docs/` describe history; do not copy retired hosting, backend or deployment steps from them. If instructions conflict with implementation, investigate and explain the discrepancy instead of guessing.

## Current shape

The application was rebuilt from a static Supabase SPA per [the rebuild decision](.planning/decisions/2026-09-22-rebuild-on-render-postgres-clerk.md) and then split into a JSON API with clients per [the split decision](.planning/decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md): `apps/api` serves the data, `apps/web` is a static single-page app that calls it, and native iOS and Android apps will call the same API. The retired implementation lives only in Git history. What is built and what is still open (first deploy, import, cutover, native apps) is in [docs/architecture.md](docs/architecture.md#status).

## Architecture rules

- Keep the shape: a Hono JSON API (`@hono/zod-openapi`) on Node in a Docker image, a React Router single-page app (`ssr: false`) served as a static site, Drizzle over Postgres, Clerk for identity, Render as the host, strict TypeScript everywhere.
- The API owns application data and every authorization decision. Clients read through the API on every load and never keep caches, stores or local copies of server data. Browser storage holds only per-device preferences.
- The repository is a pnpm workspace. `apps/api`: routes and contract (`src/contract`, `src/routes`), auth (`src/auth`), framework-free services that throw `AppError` (`src/services`), API-only rules (`src/domain`) and the database (`src/db`). `packages/domain`: pure rules both sides run; no framework, database or Node imports. `apps/web`: feature folders under `app/features/<feature>/`, route modules in `app/routes/`, the API client in `app/lib/api/`. The web app never imports server code (ESLint enforces the boundaries).
- Extract parsing, transformation, filtering and ordering into pure functions before wiring routes or I/O. Test those functions directly.
- Every mutation is one database transaction in `apps/api/src/services/`, keyed on the member from the verified session token, never on an id from the request. List changes take the per-user advisory lock and return the updated list read in that transaction.
- The API contract (`contract/openapi.json`) is generated from the route definitions and only grows: add operations, fields and error codes; never rename, retype or remove them. Follow [contract/README.md](contract/README.md) and run `pnpm contract:emit` after changing a route or schema. Installed app builds depend on it.
- Validate every boundary with Zod: request parameters and bodies through the contract schemas, form data in the web's `clientAction`, environment variables at startup, external API responses and token claims. Keep contract shapes, domain models and Drizzle row types separate; mappers translate between them.
- Schema changes ship as Drizzle migration files generated from `apps/api/src/db/schema.ts` and committed with the change. Never edit an applied migration; never use `drizzle-kit push` outside a throwaway local database. Migrations run when the API starts, while the previous release still serves, so they must stay backward-compatible.
- Components own presentation and transient interaction state. Data arrives from route `clientLoader`s as `loaderData`; changes go through `useFetcher` to the `/journal` `clientAction`, which calls the API. Preserve the existing markup, element ids and `legacy.css`; a visual redesign is a separate, explicitly scoped change.
- Do not introduce a state library, UI framework, second router, alternate package manager, ORM, API framework or hosting change incidentally. If a requirement needs an architectural change, explain the tradeoff and record the agreed decision.

## TypeScript and UI conventions

- Use strict types, `unknown` at untrusted boundaries, `import type`, and enums for finite domain modes. Avoid `any`, unchecked casts, non-null assertions and lint/type suppressions as shortcuts.
- Route modules import their generated types from `./+types/<route>`; run `pnpm typegen` (part of `pnpm typecheck`) after adding or renaming a route. In single-page mode only the root route may export `HydrateFallback`; page routes export an `ErrorBoundary` that renders `RouteError`.
- Use PascalCase component filenames and kebab-case module filenames. Colocate `*.test.ts` or `*.test.tsx`. Use relative ESM imports.
- Prefer explicit, small interfaces. Do not add layers just to match a pattern.
- Reuse `Modal`, `StateSelect` and established CSS classes. Preserve keyboard interaction, labels, mobile layout and visible error/loading states.
- Anything that reads `window`, `document`, `localStorage` or `navigator` runs in an effect or event handler, never during render: the root route renders once at build time into `index.html`. Call the API only from `clientLoader`, `clientAction`, effects and event handlers.
- Clean up effects, subscriptions, timers and in-flight requests. Handle stale async responses.
- Check every database, API and external call for failure. The API answers with the error envelope and a stable `code`; the web client raises `ApiError`. Show actionable failures through existing UI error handling; log noncritical failures when falling back. Never use an empty catch or report success after a failed write.
- Read and write browser preferences through `SafeStorage`.

## Data rules

Read the detailed rules in [docs/architecture.md](docs/architecture.md#data-rules). In particular:

- Play count is the number of round rows for a user and course. There is no stored counter.
- Personal rank is independent of published rankings. Logging a round or editing a count never changes rank. Only an explicit move renumbers, and it renumbers the whole list so filtered-out courses keep their positions.
- A round cannot exist without a membership; the schema enforces it. Deleting the last round deletes the membership.
- Course identity is resolved through `identity.ts` before a course row is created. Keep canonical geography and aliases.
- Any signed-in member may view any member's list read-only. No API response exposes another member's email address or id.
- Custom courses are shared catalog rows visible to everyone; they stay, unattributed, when their creator deletes the account.
- Deleted accounts are tombstones: they cannot sign back in to data or be re-provisioned.

## Backend and production boundaries

- Local development runs the API and web app (`pnpm dev`) against the docker-compose Postgres and a Clerk development instance. Nothing in local development touches production data.
- Secrets come from `.env` locally (gitignored; copy `.env.example`) and from Render environment variables in production. Never commit a secret key, database URL with credentials, dump or account export. Browser bundles cannot keep secrets: only the Clerk publishable key and `VITE_*` values reach the browser, and nothing secret may use the `VITE_` prefix.
- `render.yaml` is the source of truth for Render infrastructure (API, static site, database). Change services, plans, env var names and health checks there, not in the dashboard; state every `plan`, because an omitted plan is paid. Secret values are set in the dashboard with `sync: false`.
- The retired Supabase project holds the original data until it has been imported and verified. Treat it as read-only: never delete, rewrite or migrate anything there. Exports for import are run by the maintainer and kept outside the repository.
- Before any destructive action, production database change, data deletion, deploy that changes infrastructure, force push or irreversible operation, obtain explicit user confirmation for that action.
- A merge or push to `main` deploys production once cutover is complete. Until then `main` still publishes the retired application to GitHub Pages and is frozen to hotfixes; the rebuild lives on `feat/render-clerk-rebuild`.

## Workflow and completion

- Use pnpm with the committed lockfile and Node from `.nvmrc`; supported versions are in `package.json`. Do not opportunistically upgrade the pinned compiler/linter toolchain.
- Use `feat/`, `fix/` or `hotfix/` descriptive branch names. Preserve unrelated user changes.
- New behavior gets tests; bug fixes get regression tests. Mock external boundaries (Clerk's Backend API, OpenGolfAPI), not the business logic being tested. Services and API operations are tested against the local Postgres with the real app and real token verification, not against mocks of the database.
- Run the checks in [docs/testing.md](docs/testing.md): lint, typecheck, tests, build and the contract check, plus browser tests for application changes. Report anything not run or any unresolved failure accurately.
- Keep docs current in the same change when patterns, commands, configuration or behavior change. Keep these instructions canonical; tool-specific instruction files should point here.
- Use Conventional Commits and commit completed logical units when permitted. Review the diff for unintended changes before pushing.
- Record meaningful architectural decisions in `.planning/decisions/`; keep branch state under 80 lines and local session notes under `.planning/sessions/`. Checkpoint branch state after meaningful decisions or investigations and before handoff. Record actionable lessons after user corrections.
- Final handoff: explain what changed, how it was verified, relevant limitations and the branch/PR. Do not claim production authentication or deployment works solely because local tests pass.
