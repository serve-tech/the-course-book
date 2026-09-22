# Working on The Course Book

These instructions apply throughout this repository. Follow the established patterns without waiting for the user to request them. Extend the existing application; do not use an ordinary feature request as a reason to redesign it.

## Read before editing

1. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and [docs/architecture.md](docs/architecture.md) for responsibilities and compatibility contracts.
2. Read [docs/testing.md](docs/testing.md) before changing behavior or tests.
3. Resolve the current Git branch. If present, read its `.planning/STATE-<branch-with-slashes-replaced-by-hyphens>.md`, `.planning/lessons.md`, and relevant decisions/research. Missing local state is normal on a fresh clone.
4. Inspect the nearest existing implementation and its tests. Read [docs/react-migration.md](docs/react-migration.md) when touching existing behavior.

The current code, configuration and active decisions describe today's implementation. Dated infrastructure reports describe history; do not copy retired project identifiers or deployment steps from them. If instructions conflict with implementation, investigate and explain the discrepancy instead of guessing.

## Architecture rules

- Keep React + Vite + strict TypeScript, Supabase and static GitHub Pages hosting. There is no application server.
- Organize by feature under `src/features/<feature>/`. Keep that feature's models, pure functions, components, repositories, services and tests together.
- Extract parsing, transformation, filtering and reconciliation into pure functions before wiring UI or I/O. Test those functions directly.
- Components own presentation and transient interaction state. Use `useServices()` for dependencies and `useJournal()` for shared account state.
- Repositories own Supabase SDK queries and expose typed operations. Inject the typed client; do not create clients or make raw Supabase queries in components.
- Services coordinate operations across repositories, including account ownership checks and partial-failure handling. Simple reads can use existing repositories; do not introduce a service that only forwards every method.
- Register dependencies in `src/app/services.ts`. Do not construct a second store/client/service graph inside a component.
- Use the existing `JournalStore` for shared account state. Do not introduce parallel copies of the journal in component state, another context store or another state library.
- Put code in `shared/` only when it is actually shared. Prefer clear feature-specific modules over generic base repositories, managers or speculative abstractions.
- Do not introduce a router, state framework, UI framework, server runtime, alternate package manager or broad redesign incidentally. If a requirement needs an architectural change, explain the tradeoff and record the agreed decision. Routine changes that fit existing patterns should proceed without extra approval.

## TypeScript and UI conventions

- Use strict types, `unknown` at untrusted boundaries, `import type`, and enums for finite domain modes. Avoid `any`, unchecked casts, non-null assertions and lint/type suppressions as shortcuts.
- Validate external data with the existing Zod approach. Keep application models distinct from generated database row types.
- Use PascalCase component filenames and kebab-case domain/service/repository/hook filenames. Colocate `*.test.ts` or `*.test.tsx`. Follow existing relative ESM imports.
- Prefer explicit, small interfaces and constructor/factory injection. Do not add layers just to match a pattern.
- Reuse `Modal`, `StateSelect` and established CSS classes where appropriate. Preserve keyboard interaction, labels, mobile layout and visible error/loading states.
- Treat `src/shared/styles/legacy.css` as compatibility-sensitive. Avoid global restyling during an unrelated feature change.
- Clean up effects, subscriptions, timers and requests. Handle stale async responses.
- Check Supabase errors. Show actionable failures through existing UI error handling; log noncritical failures when falling back. Never use an empty catch or report success after a failed write.
- Read and write application local storage through `SafeStorage`; do not change Supabase's default auth persistence as part of a UI refactor.
- `database.types.ts` is generated. Regenerate it from the intended schema when an authorized schema change requires it; do not hand-edit it to make incorrect queries compile.

## Compatibility rules

Read the detailed contracts in [architecture](docs/architecture.md#compatibility-contracts). In particular:

- Round rows determine play counts; membership, personal order and published rankings are distinct concepts.
- Logging an existing course or editing its count must not rewrite its personal rank.
- Keep canonical course identities and mappings. A local course ID is not necessarily a database UUID.
- Preserve per-account caches and legacy ownership rules. When cloud memberships exist, their personal ranks are authoritative; local order is the fallback only when memberships are absent. Reject hydration that races a local edit.
- Capture account ownership for asynchronous operations and recheck after awaits before later writes or commits. A user-ID-only check does not handle A → B → A switches.
- Never turn cached play counts into invented round history.
- Preserve hidden courses when reordering a search result. Geographic journal views stay read-only.
- Existing quirks are documented in the migration notes. Fix them only when included in the task, with characterization/regression tests and an assessment of stored-data effects.

## Backend and production boundaries

- Local development points at the live backend by default. Automated tests must use synthetic accounts and mocked external services.
- The browser configuration is `src/infrastructure/supabase/public-config.json`. It contains public connection information, not privileged credentials. There is no required `.env` setup for normal frontend development.
- Never commit service-role keys, management tokens, SMTP credentials, passwords, database dumps or real account exports. Browser bundles cannot keep secrets.
- Client ownership guards are not authorization; database grants and RLS enforce access.
- Before any destructive action, database change, data deletion, force push or irreversible operation, obtain explicit user confirmation for that action. A frontend task does not authorize infrastructure cleanup, account migration, policy changes or production writes for testing.
- Drafting a migration is different from applying one. Never alter an applied migration or the remote ledger to silence a mismatch. See the read-only preflight in [README.md](README.md#supabase-configuration-and-migrations).
- A merge or push to `main` triggers production Pages deployment. Keep work on a feature/fix branch and do not merge or change hosting/backend settings unless authorized.

## Workflow and completion

- Use npm with the committed lockfile and Node from `.nvmrc`; supported versions are in `package.json`. Do not opportunistically upgrade the pinned compiler/linter toolchain.
- Use `feat/`, `fix/` or `hotfix/` descriptive branch names. Preserve unrelated user changes.
- New behavior gets tests; bug fixes get regression tests. Mock external boundaries, not the business logic being tested.
- Run the relevant checks in [docs/testing.md](docs/testing.md), including lint, typecheck, tests and build. Run browser tests for application changes. Report anything not run or any unresolved failure accurately.
- Keep docs current in the same change when patterns, commands, configuration or behavior change. Keep these instructions canonical; tool-specific instruction files should point here.
- Use Conventional Commits and commit completed logical units when permitted. Review the diff for unintended changes before pushing.
- Record meaningful architectural decisions in `.planning/decisions/`; keep branch state under 80 lines and local session notes under `.planning/sessions/`. Checkpoint branch state after meaningful decisions or investigations and before handoff. Record actionable lessons after user corrections. Use the local planning skills if installed; these repository conventions also work without them.
- Final handoff: explain what changed, how it was verified, relevant limitations and the branch/PR. Do not claim production authentication, RLS or email delivery works solely because mocked tests pass.
