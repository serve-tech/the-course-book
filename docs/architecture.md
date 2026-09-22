# Architecture and extension guide

The Course Book is a static React application built by Vite and hosted under `/the-course-book/` on GitHub Pages. Supabase supplies authentication and database access. There is no custom backend server, server rendering or URL router.

The [architecture decision](../.planning/decisions/2026-09-18-react-typescript-architecture.md) explains this choice. [AGENTS.md](../AGENTS.md) supplies mandatory working rules.

## Responsibilities

| Location | Owns | Starting example |
| --- | --- | --- |
| `src/app/` | Composition, dependency injection, startup and tab navigation | [services.ts](../src/app/services.ts), [context.ts](../src/app/context.ts), [App.tsx](../src/app/App.tsx) |
| `features/auth/` | Form validation, email/password authentication and dialog | [auth-form.ts](../src/features/auth/auth-form.ts), [auth-repository.ts](../src/features/auth/auth-repository.ts) |
| `features/catalog/` | Course identity, published rankings, geography, search and catalog access | [identity.ts](../src/features/catalog/identity.ts), [catalog-service.ts](../src/features/catalog/catalog-service.ts) |
| `features/journal/` | Per-account state/cache, reconciliation, personal list and ordering | [account-state.ts](../src/features/journal/account-state.ts), [journal-store.ts](../src/features/journal/journal-store.ts) |
| `features/rounds/` | Round history, logging/count changes and multi-step mutation handling | [round-service.ts](../src/features/rounds/round-service.ts), [round-repository.ts](../src/features/rounds/round-repository.ts) |
| `features/friends/` | Registered-member directory and read-only lists | [FriendsPage.tsx](../src/features/friends/FriendsPage.tsx), [friends-repository.ts](../src/features/friends/friends-repository.ts) |
| `infrastructure/supabase/` | Typed client, generated schema types and public configuration | [client.ts](../src/infrastructure/supabase/client.ts) |
| `shared/` | Reused UI, storage/error/geolocation helpers, geographic data and styles | [Modal.tsx](../src/shared/ui/Modal.tsx), [storage.ts](../src/shared/lib/storage.ts) |

Paths in the feature rows are relative to `src/`. Feature folders are the organizational unit; avoid global `components/`, `services/` and `repositories/` folders that scatter one feature across the project.

## Dependencies and data flow

`main.tsx` constructs the application dependencies through `createServices()`. The provider exposes these via `useServices()`; `useJournal()` subscribes to the journal through React's `useSyncExternalStore`.

A typical write flows from a dialog to `RoundService`, then through typed repositories to Supabase, and finally through journal hydration/publication to the UI. Pure functions handle identity and account reconciliation independently of React or network access.

Repositories accept `CourseBookClient` and expose typed interfaces. They implement SDK queries and propagate errors. Services coordinate repositories when an operation has ordering, ownership or compensation requirements. Components can coordinate simple reads using existing repositories, as Friends does; they must not embed raw Supabase queries. The app handles startup/auth subscriptions and rendering.

Keep domain functions independent of infrastructure. Cross-feature service dependencies are explicit constructor arguments; use those existing boundaries rather than importing the React context into business logic.

## Where state belongs

| State | Place |
| --- | --- |
| Open dialog, form fields, selected tab, temporary loading/error state | Component state |
| Shared active account, played counts, personal order | `JournalStore` and its immutable snapshot |
| Course metadata, canonical mappings and catalog/search caches | Existing catalog/search services |
| Persisted account cache and preferences | Existing cache helpers through `SafeStorage` |
| Session tokens and auth persistence | Supabase's existing client defaults |
| Derived filtering, ordering and display values | Pure selectors/functions; avoid a second persisted copy |

`JournalStore.ready` indicates that an account owner is active; it does not mean all server hydration has completed. Async consumers must still handle loading and stale results.

Do not mutate store snapshots or maintain a competing journal state in a component. Follow existing store methods to publish changes and persist the owner-scoped cache.

## Extend an existing feature

For a new round-related interaction:

1. Put presentation in `features/rounds/`, reusing shared controls where appropriate.
2. Put new calculations/validation in a pure feature module with a colocated test.
3. Add a typed repository operation only if existing operations do not cover the required I/O.
4. Coordinate multiple writes in `RoundService`, preserving owner checks and partial-failure handling.
5. Inject any new dependency in `app/services.ts`; use the existing provider in the UI.
6. Add service regressions and a browser scenario for user-visible behavior.

For a catalog filter, extend the existing pure selectors and their data-driven tests before adding controls. Do not add a new data store to hold a filtered copy.

For a genuinely new feature, create a feature folder and only the modules it needs. A read-only component does not automatically need a service class and repository interface of its own.

## Types and boundaries

[course.ts](../src/features/catalog/course.ts) defines the application course model using Zod. [database.types.ts](../src/infrastructure/supabase/database.types.ts) is generated from the database schema. Keep these concepts separate: UI/domain identity is not interchangeable with a database row or UUID.

Validate untrusted API/cache/form input at boundaries. Use `unknown` until validated, handle missing indexed values and distinguish an absent optional field from one assigned `undefined`. The strict compiler settings enforce these distinctions.

Use existing error presentation via [errors.ts](../src/shared/lib/errors.ts). Noncritical cache failures can fall back after logging; failed mutations need visible failure and recoverable controls. Do not swallow an exception to make a workflow appear successful.

## Compatibility contracts

These are current product/data contracts, not optional implementation details:

- **Counts:** round rows are the source of play counts. A membership can exist with zero rounds. Never synthesize historical round rows from cached counts.
- **Order:** published world/USA/public/state rankings and personal ranks are separate. Logging or changing the count of an existing course must not update its personal rank. Explicit moves synchronize personal order.
- **Hydration:** when cloud memberships exist, use their personal ranks, appending round-only courses afterward. Use local order only when cloud memberships are absent. Reject stale hydration after a local edit, and never rewrite cloud ranks during startup. See the [cloud-order decision](../.planning/decisions/2026-09-22-cloud-order-and-verification.md).
- **Identity:** bundled/local IDs, database UUIDs and external search IDs are distinct. Resolve selections through catalog identity logic; richer search text must not replace canonical IDs. Preserve canonical Scottish geography even when a cloud row is incorrect.
- **Account isolation:** capture the journal owner token for async operations and recheck it after awaits before subsequent writes or commits. Its generation distinguishes A → B → A switches. Frontend checks complement, but never replace, RLS.
- **Partial writes:** when membership creation fails after round insertion, compensate only the newly inserted round IDs. A rollback failure must be surfaced; do not claim the operation was atomic.
- **Search and geography:** reordering a text-filtered personal list preserves hidden courses. Geographic journal filters remain read-only. Published-list progress uses the full list, independent of search; “Show mine” uses positive play counts.
- **Published lists:** world, USA and public lists require 100 unique ranks; state scopes have their own completeness rule. Reuse existing selectors instead of assuming every scope has 100 entries.
- **Friends:** this is a directory of other registered members, not a friendship/following graph.
- **Authentication:** sign-in reads the visible email from `AuthForm.identity`; `form.email` is signup-only. Reuse the existing credential/validation functions. Signup also handles usernames and confirmation-required responses. Preserve session persistence and the deployed email redirect.
- **Preferences:** preserve manual state selection, optional geolocation behavior and cached preferences.

The [migration notes](react-migration.md) record the original compatibility baseline and later changes. Cloud-authoritative ordering superseded the original fresh-device/local-order behavior. Requested changes to remaining quirks need explicit scope, regression tests and consideration of existing data.

## Storage and backend configuration

Account caches use `theCourseBook_user_<auth-id>`. The old `theCourseBook` cache has one-time ownership through `theCourseBookLegacyOwner`; `theCourseBookMigrated_<auth-id>` tracks migration. Catalog mappings and preferences also have established keys in their owning modules.

Do not rename keys, clear caches, reassign legacy ownership or rebuild identity mappings during an unrelated refactor. Consult [account-state.ts](../src/features/journal/account-state.ts), [catalog-service.ts](../src/features/catalog/catalog-service.ts) and their tests before changing persistence.

The frontend and migration preflight share [public-config.json](../src/infrastructure/supabase/public-config.json). It is browser-safe configuration. A `.env` file does not automatically override it. A local dev server therefore uses the configured live backend unless deliberately changed for a separate environment.

The active schema baseline is under [supabase/migrations](../supabase/migrations/). Files under [docs/archive](archive/) are historical, not migrations to apply. Frontend CI/Pages workflows do not deploy database migrations.

## Appearance and hosting

Reuse the existing shared primitives and CSS. The legacy stylesheet preserves what Chromium parsed from the old page, including rules the browser ignored; broad “CSS cleanup” can change appearance.

The legacy HTML in [tests/fixtures/legacy/index.html](../tests/fixtures/legacy/index.html) is frozen comparison input. Do not update it to make a regression disappear or use it as the application entry point.

Vite's base path and Supabase's auth redirect must remain consistent with the Pages URL. Introducing history-based routes needs a deliberate static-hosting navigation plan; the current tabs do not require a router.
