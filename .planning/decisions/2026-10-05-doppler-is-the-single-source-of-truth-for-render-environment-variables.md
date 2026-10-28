# Doppler is the single source of truth for Render environment variables

**Date:** 2026-10-05
**Status:** Accepted

## Context

Until now, `render.yaml` held every non-secret setting as a `value:`:

- the Clerk publishable and JWT public keys;
- `WEB_ORIGINS` and `PUBLIC_WEB_URL`;
- `VITE_API_URL` and `NODE_VERSION`;
- `DATABASE_URL`, wired from the database with `fromDatabase`.

The one secret, `CLERK_SECRET_KEY`, was `sync: false` and entered in the Render dashboard. AGENTS.md made `render.yaml` the source of truth for all of these.

On 2026-10-05, during the Clerk production switch (PR #30), the maintainer began syncing both Render services' environment variables from Doppler. That made two writers for the same variables. A Blueprint sync writes the `render.yaml` values. Doppler writes its own values continuously. When they disagree, whichever ran last silently wins.

## Options Considered

1. **`render.yaml` for non-secret values, Doppler for secrets only**
   - Pros: settings are reviewed in pull requests; no vendor holds non-secret config; follows the existing AGENTS.md rule.
   - Cons: two places to look; the maintainer manages configuration in Doppler and would have to remember which variables live where.
2. **Doppler for every variable, except `DATABASE_URL` wired by Render (`fromDatabase`)**
   - Pros: one place for configuration; Render keeps the credential it generates.
   - Cons: still two writers, for one variable.
3. **Doppler for every variable, including `DATABASE_URL`**
   - Pros: one source of truth with no exceptions; `render.yaml` carries only infrastructure.
   - Cons: Doppler holds a copy of a credential Render generates. If the database is recreated or its credentials change, Doppler must be updated by hand, or the API cannot connect.

## Decision

Option 3, chosen by the maintainer on 2026-10-05.

Scope is Render production only:
- local development keeps `.env` (from `.env.example`);
- CI keeps its GitHub secrets.

`render.yaml` keeps the infrastructure:
- services, plans, regions, build and start settings;
- health checks, `autoDeployTrigger` and routes;
- headers and the database.

It declares no environment variables.

## Consequences

- **Removing the variables from `render.yaml` changes nothing at runtime.** Render's Blueprint spec: "Render _preserves_ existing environment variables, even if you omit them from the Blueprint file" (https://render.com/docs/blueprint-spec). The values already on each service stay until Doppler changes them.
- **Doppler must hold every variable each service reads.**
  - API: the authoritative list is the Zod schema in `apps/api/src/services/env.ts`.
    - Required: `DATABASE_URL` (Render's *internal* connection string), `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `WEB_ORIGINS`.
    - Production also sets `CLERK_JWT_KEY` and `PUBLIC_WEB_URL`.
    - The rest have defaults.
  - Web: `VITE_API_URL`, `VITE_CLERK_PUBLISHABLE_KEY` and `NODE_VERSION`.
  - The API refuses to start when a required variable is missing or invalid.
- **Database credentials are now a manual step.**
  - Recreating `coursebook-db`, restoring it into a new instance (point-in-time recovery creates a new database) or rotating its credentials changes `DATABASE_URL`, and Doppler must be updated before the API redeploys.
  - The plan upgrade in PR #29 changes the instance type in place; confirm afterwards that the connection string is unchanged.
- **New values need a deploy to take effect.**
  - `VITE_*` values are compiled into the web bundle, so a change needs a web rebuild.
  - API values need an API deploy.
  - On 2026-10-05 a Doppler change to `VITE_API_URL` reached the live web bundle without a commit or manual deploy. Always confirm a change is live rather than assuming the sync deployed it.
- **A fresh Blueprint** (a new environment or a recreated service) starts with no variables. Connect Doppler before the first deploy.
- **Access:** anyone with access to the Doppler project can read production secrets, including the Clerk secret key and the database credentials.
- **Vendor:** this adds a vendor outside Render, contrary to the earlier preference to keep everything on Render. The maintainer accepted that for configuration.
- **Superseded rules:**
  - AGENTS.md ("`render.yaml` is the source of truth … non-secret settings are values in `render.yaml`; only `CLERK_SECRET_KEY` is `sync: false`");
  - the matching text in README, `docs/architecture.md` and `docs/cutover.md`.

  All are updated with this change.
