# Split into a JSON API service consumed by web, iOS and Android clients

**Date:** 2026-09-25
**Status:** Accepted. Supersedes the single-process application shape of [the rebuild decision](2026-09-22-rebuild-on-render-postgres-clerk.md); its choices of Render, Postgres, Drizzle, Clerk and Docker stand.

## Context

The rebuild on `feat/render-clerk-rebuild` produced one React Router framework-mode process: route loaders and actions call `app/server/*.server.ts`, pages are server-rendered, and there is no separate API. Browser tests passed against a Clerk development instance on 2026-09-25; nothing has been cut over and no production data has been imported.

The maintainer then stated two requirements the rebuild did not weigh:

- Native iOS (Swift) and Android (Kotlin) apps are planned for the app stores immediately, not later.
- Keep everything on Render as ordinary long-running services: no new vendors, no serverless or edge functions, free tiers for as long as practical (see [free-tier research](../research/2026-09-25-free-tier-hosting.md)).

Native clients cannot use React Router's loader data format or the form-encoded `/journal` action; they need a stable, versioned JSON API with a published contract. Clerk ships native SDKs for iOS and Android (https://clerk.com/docs/reference/ios/overview, https://clerk.com/docs/android/reference/native-mobile/overview) that send session tokens as bearer tokens, which `@clerk/backend` verifies from the `Authorization` header.

## Options Considered

1. **Keep the single React Router service; add `/api/v1` resource routes for mobile later**
   - Pros: no rework now; one deployable.
   - Cons: web and mobile use different contracts that can drift; resource routes give no OpenAPI tooling for Swift/Kotlin generation; mobile API deploys are coupled to web UI changes; the maintainer finds the combined model unfamiliar.
2. **Separate API service; web becomes a static single-page app that calls it like the mobile apps do**
   - Pros: one contract for three clients, exercised by the web app; the contract can be published as OpenAPI to generate Swift and Kotlin clients; the static site is free on Render and never sleeps; familiar frontend/backend shape; the rebuild's objection (the company standard reserves Hono for headless services) no longer applies because a mobile-facing API is headless.
   - Cons: rework of every page's data loading, web authentication and the browser test harness before cutover; two services plus a static site; cross-origin requests need CORS; server-rendered first paint is lost (low value for a members' journal).
3. **Separate API with the web app still server-rendered, calling the API from its server (backend-for-frontend)**
   - Pros: keeps server rendering.
   - Cons: two Node services and an extra network hop per page for no user-visible gain; the most moving parts.

## Decision

Option 2. The API is its own Render web service and the only owner of application data and authorization. The web app is a static single-page app on Render and a client of that API, alongside the iOS and Android apps. The domain logic, transactions, schema, migrations and their tests from the rebuild carry over; transport and client data loading are rewritten. The change is made before cutover, when it is cheapest.

### Implementation choices (approved plan and P0 spikes, 2026-09-25)

- **Layout:** pnpm workspace with `apps/api` (`@coursebook/api`), `apps/web` (`@coursebook/web`), `packages/domain` (pure rules both sides run), `tests/e2e`, and a language-neutral `contract/openapi.json`; native apps later in `apps/ios` and `apps/android`.
- **API:** Hono 4 on `@hono/node-server` with `@hono/zod-openapi`; OpenAPI 3.0.3 generated from route definitions and committed; one esbuild bundle; migrations run in-process at start under an advisory lock (free Render plans have no pre-deploy command).
- **Auth:** `@clerk/backend` `authenticateRequest` with `acceptsToken: "session_token"` and a `jwtKey`, **without `authorizedParties`**, because it rejects tokens lacking `azp` and native tokens have none. Our policy afterwards: `azp` present must be an allowed web origin; absent is accepted. No `Authorization` header means anonymous (Clerk is not called); an invalid header is 401. Cookies are ignored, so there is no CSRF surface.
- **Web:** React Router 8 framework mode with `ssr: false`; `ClerkProvider` in the root `Layout`; `clientLoader`/`clientAction` call the API through `openapi-fetch` types generated from the committed contract.
- **Contract rules for Swift and Kotlin:** see [API split spikes](../research/2026-09-25-api-split-spikes.md): named schemas, explicit `operationId`s, always-present response fields, `.nullish()` request fields, error codes as documented strings.

## Consequences

- `AGENTS.md`, `docs/architecture.md`, `docs/testing.md`, `docs/cutover.md` and `render.yaml` change from the one-process model to API + static web + database.
- Every client authenticates to the API with a Clerk session token in the `Authorization` header; the API derives the user from the token, never from request parameters.
- The API contract is versioned and published so native clients can be generated from it; breaking changes need a new version because installed app builds cannot be forced to update.
- Render footprint: API web service (free for staging; a paid plan once the apps ship, since a native app cannot wait a minute for a cold start), static site (free), Postgres (free for staging, paid from cutover).
- App-store requirements (for example in-app account deletion and store sign-in rules) become API and product requirements.
- Cutover is delayed until the API and web client are rebuilt and the browser suite is green again.
