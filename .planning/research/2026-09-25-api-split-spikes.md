# API split spikes (P0)

**Date:** 2026-09-25
**Question:** Do the tools chosen for the API split work together before the restructure starts?
**Status:** All six spikes passed. Throwaway code lived in the session scratchpad and branch `spike/api-split`; nothing was merged.

## Results

| Spike | Result | Consequences for implementation |
| --- | --- | --- |
| S1 React Router 8.4 `ssr: false` + Clerk | Pass on desktop and mobile Chromium, no console errors. Build writes `build/client/index.html`. `ClerkProvider publishableKey` in the root `Layout` lets route `clientLoader`s await `getToken()` (exported by `@clerk/react-router`) on first load without deadlock. Ticket sign-in and sign-out revalidate when the layout revalidates on `useAuth().userId` changes. Deep links (`/friends`, `/sign-in/sso-callback`) work behind an index.html fallback. | Provider in `Layout`, not `App`. Revalidate on Clerk user change. The build also emits `build/server` for the prerender; only `build/client` is published. |
| S1b Web token verification | A real dev-instance web token carries `azp` = page origin and the custom claims. `authenticateRequest` with `acceptsToken: "session_token"` and no `authorizedParties` → signed-in; matching list → signed-in; other origin → `token-invalid-authorized-parties`; tampered → `token-invalid-signature`. | Own `azp` policy after verification (native tokens lack `azp`). Tokens also carry `email`; never echo it. |
| S2 `@hono/zod-openapi` 1.6.3 + Zod 4.6.5 | Single Zod copy. `getOpenAPIDocument({ openapi: "3.0.3" })` renders nullable, uuid/date formats, bounds, enums, named components, bearer scheme. Missing body (with `required: true`) → 400 and wrong Content-Type → 415 both arrive via `onError` as `HTTPException`; unknown routes are plain-text 404 by default. | `onError` maps exception statuses to the error envelope; `app.notFound` returns the envelope; name every nested schema with `.openapi("Name")`. |
| S3 openapi-typescript 7.13 + openapi-fetch 0.17 under TypeScript 6.0.3 | Works; unmet peer warning only (`typescript ^5`). Properties with `default` become required unless generated with `--default-non-nullable=false`. | Generate with `--default-non-nullable=false`; accept the peer warning. |
| S4 Swift (`swift-openapi-generator` 1.13, SwiftPM plugin) and Kotlin (`openapi-generator` 7.25, `jvm-okhttp4`, kotlinx serialization) | Both generate and compile; method names follow `operationId`s. Swift fails the whole decode on an unknown enum value (no switch). Kotlin needs `enumUnknownDefaultCase=true`. Swift omits nil request fields; Kotlin sends explicit `null`. | See contract rules below. |
| S5 esbuild bundle in Docker | 1.58 MB single ESM file (all deps bundled except `pg-native`, `createRequire` banner) runs with no `node_modules`; `authenticateRequest` with a local `jwtKey` verifies networkless. Image 62.5 MB compressed. Cold start to first `/healthz` at `--cpus 0.1 --memory 512m`: 4.9–6.6 s (0.78 s at 1 CPU); 38 MiB RSS. With no `Authorization` header `authenticateRequest` follows Clerk's cookie path (`dev-browser-missing`). | No header → anonymous without calling Clerk. Set `CLERK_TELEMETRY_DISABLED=1` in the image. |
| S6 pnpm 12.5.1 | `pnpm fetch` + `install --offline --frozen-lockfile --filter` works in Docker. In a plain `node:24` image, `corepack enable` and `npm i -g` fail as a non-root user; `corepack pnpm …` works as root and non-root. pnpm 12's `minimumReleaseAge` adds `minimumReleaseAgeExclude` entries for freshly published packages. corepack ships with Node 24 but not 25+. | Render static build command: `corepack pnpm install --frozen-lockfile && corepack pnpm --filter @coursebook/web build`, with `NODE_VERSION=24`. Review `pnpm-workspace.yaml` diffs when adding new packages. |

## Contract rules adopted (for Swift and Kotlin clients)

1. OpenAPI 3.0.3. Every route has an explicit camelCase `operationId` and `tags`; every object and enum has a name via `.openapi("Name")`; no inline nested objects, no top-level arrays, no `oneOf`/`anyOf`.
2. Responses: every field always present; `.nullable()` where empty; never `.optional()`; no `default`.
3. Requests: every non-mandatory field is `.nullish()` (missing and `null` mean the same thing); no Zod `.default()`; handlers apply defaults.
4. Error `code` and any response enum that may gain values are documented strings, not enums (installed Swift builds cannot decode new enum values). Request-only enums may stay enums. The server keeps a TypeScript `ErrorCode` enum internally.
5. Kotlin generation uses `enumUnknownDefaultCase=true`; Swift treats uuid and date as `String`.

## Environment note

This machine runs Node 25.3.0 while `.nvmrc` pins 24 and `package.json` engines allow `^24.15.0 || >=26`. Docker images and Render use Node 24.
