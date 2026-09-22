# Rebuild on Render with Postgres and Clerk

**Date:** 2026-09-22
**Status:** Accepted

**Implementation:** branch `feat/render-clerk-rebuild` in this repository. `main` continues to deploy the Supabase application to GitHub Pages until cutover; it is frozen to hotfixes.

## Context
The application is a browser-only React SPA on GitHub Pages that talks directly to Supabase (PostgREST plus row-level security as the authorization layer). The Supabase project lives in a company organization that the internal-tools standard (v2.1) plans to sunset. Authorization rules exist only as RLS policies that no automated test exercises. Local development writes production data. Recent incidents involved migration-ledger mismatches and ad-hoc dashboard changes (backup tables created outside Git with RLS disabled).

The product has been renamed coursebook.golf and now has a single maintainer. The company already pays for Clerk on another project.

## Options Considered
1. **Stay on Supabase and harden** (dev branch, narrowed policies, env-driven config)
   - Pros: days of work; no data or account migration.
   - Cons: keeps RLS-only authorization, keeps the organization dependency the standard sunsets, throwaway once the app must move anyway.
2. **Move to Render + Postgres + Clerk, following the production standard** (React Router v7 framework mode, Drizzle migrations, Zod, Docker artifact)
   - Pros: aligns with the standard's hosting/database/migration model; authorization becomes server code with ordinary tests; server-owned data removes most client cache/reconciliation complexity; local dev uses a local Postgres.
   - Cons: adds an application tier that does not exist today; every repository is rewritten; user IDs change (Supabase UUID to Clerk ID); weeks of solo work; Render preview environments are plan-gated.
3. **Keep the static SPA and add only an API** (Hono on Render, Clerk, Postgres)
   - Pros: smaller frontend change.
   - Cons: standard reserves Hono for headless services; two deployables; still requires the full backend rewrite.

## Decision
Option 2. Rebuild on a branch in this repository rather than from the standard's template repo, which does not yet exist; this is a deliberate deviation. Clerk is used despite the standard rejecting it for internal tools, because this is a consumer-facing app with public sign-up and the standard has no consumer-facing section; record that carve-out in the standard.

Carry over the pure domain modules and their tests (identity, search scoring/results, ranking selectors, geography, round-count rules). Rewrite repositories as server loaders/actions over Drizzle. Migrate data by export and import with a user-ID mapping; existing accounts sign in fresh through Clerk and are matched by email.

## Consequences
- `AGENTS.md`, `docs/architecture.md`, `docs/testing.md`, CONTRIBUTING and the CI/Pages workflows describe the old architecture and must be rewritten on the branch before agents can work under the new rules.
- GitHub Pages deployment ends at cutover; Render serves the app at coursebook.golf. The `/the-course-book/` base path, per-account local caches, Supabase session persistence and the cloud-rank/local-order reconciliation contracts are retired, not ported.
- Schema changes ship as committed Drizzle migration files with a drift check in CI.
- The Supabase project is paused, not deleted, until a restore of the new database has been tested.
- Before cutover, the anonymous-readable backup tables on Supabase still need their access revoked; that fix is independent of this rebuild.
