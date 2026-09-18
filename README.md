# The Course Book

A React and TypeScript golf journal maintained by Serve Tech, using Supabase for accounts and data and GitHub Pages for static hosting.

- Live app: https://serve-tech.github.io/the-course-book/
- Repository: https://github.com/serve-tech/the-course-book
- Backend: The Course Book, project `naawqzwvegqbhioqqzkh`, in Serve Electric Incubator.

## Development

Use Node 24 LTS, version 24.15 or later within that major version. The system Node 25 installation is outside this project's supported runtime range.

```sh
nvm use
npm ci
npm run dev
```

Open http://localhost:5173/the-course-book/. Development uses the existing production backend by default; signed-in manual actions write live data. Automated tests use synthetic data and mocked external services.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

For browser tests, install Chromium once, then run the suite. The suite builds and serves the production artifact.

```sh
npx playwright install chromium
npm run test:e2e
```

## Organization

- `src/app/`: application composition, navigation and dependency injection.
- `src/features/auth/`: email authentication validation, repository and dialog.
- `src/features/catalog/`: course identity, geography, search, published rankings and catalog repository.
- `src/features/journal/`: per-account caches, pure ordering/reconciliation, owner-scoped synchronization and personal-list components.
- `src/features/rounds/`: round repository, mutation orchestration and dialogs.
- `src/features/friends/`: registered-member directory and read-only rankings.
- `src/infrastructure/supabase/`: generated database types, typed client and public configuration.
- `src/shared/`: small shared UI primitives, guarded storage, geographic options and preserved styles.

Components render state and dispatch operations. Repositories contain Supabase queries; services coordinate external operations. Identity, search scoring, geographic filtering and account reconciliation are pure functions with colocated tests. Domain models are separate from generated database DTOs. No service-role or SMTP credential belongs in browser code.

The compiler enables strict mode, unchecked-index checks and exact optional properties. Typed ESLint and React hooks rules run in CI. TypeScript 6.0.3 is deliberately pinned to the version supported by the current typescript-eslint release; upgrading to TypeScript 7 also requires a compatible linter.

## Compatibility and verification

`tests/fixtures/legacy/index.html` is the frozen production baseline at `b4b34b4`, used only for characterization and browser comparisons. The production bundle contains the React application, not the legacy runtime.

The migration preserves the existing Supabase session storage, per-account local storage keys, course identities, published-ranking semantics, personal order and round-count source. Existing CSS was serialized from Chromium's parsed stylesheet rules because the original contains malformed CSS that browsers already ignore. Desktop and mobile layout tests compare the new view directly against the executable legacy fixture.

See [the migration notes](docs/react-migration.md) for preserved quirks, intentional correctness improvements and verification limits. Historical inline-auth tests remain as baseline characterization; new TypeScript and browser tests exercise the replacement.

## GitHub Pages

Vite builds static assets into `dist/` with base `/the-course-book/`. Render is not required.

The feature branch does not change the production Pages setting. **When this branch is approved for release, switch Settings → Pages → Build and deployment → Source to GitHub Actions, then merge.** The main-only `pages.yml` workflow builds and uploads `dist/`; publishing repository-root TypeScript through the old branch source will not work. CI verifies feature branches and pull requests without deploying them.

Keep the live Auth site URL and email-confirmation redirect at https://serve-tech.github.io/the-course-book/.

## Supabase configuration and migrations

The browser-safe configuration is in `src/infrastructure/supabase/public-config.json`. Its publishable key is intentionally public; database grants and row-level security enforce access. The typed client retains Supabase's default session persistence.

The React rewrite does not alter database schema, accounts, SMTP configuration or authorization policies. `supabase/migrations/` contains the baseline applied to Incubator; retired migrations remain under `docs/archive/`.

Before any database deployment, set `SUPABASE_ACCESS_TOKEN` securely and run:

```sh
node scripts/check-migration-history.mjs
```

This read-only check derives its target from the same public JSON configuration and compares the remote migration ledger. Review mismatches before deployment; never repair a live ledger simply to silence an error.

See the [Incubator migration report](docs/incubator-migration-2026-09-18.md) for historical account/data transfer verification.
