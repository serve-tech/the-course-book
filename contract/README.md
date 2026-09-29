# API contract

`openapi.json` is the published contract of the coursebook.golf API (OpenAPI 3.0.3). The web app, and later the iOS and Android apps, generate their clients from it.

It is generated, never edited by hand: the route definitions in `apps/api/src/contract/` produce it, so it always matches what the API validates and serves (also at `/v1/openapi.json`).

```sh
pnpm contract:emit   # regenerate openapi.json and the web app's TypeScript types
pnpm contract:check  # what CI runs: regenerate and fail if anything changed
```

## Rules

Installed app builds cannot be forced to update, so the contract only grows.

- Add operations, fields and error codes; never rename, retype or remove them. A breaking change needs a new version path (`/v2/...`).
- Every object schema has a name; no `oneOf`, `anyOf` or `allOf`.
- Response fields are always present and use `null` for "none"; they are never optional.
- Optional request fields accept both a missing key and `null` (Swift omits nil values; Kotlin sends `null`).
- Values that may gain members, such as error `code` and ranking list `type`, are documented strings, not enums: Swift cannot decode an enum value it does not know.
- `operationId`s become method names in the generated clients; never rename one.
- No schema exposes another member's email address or id.

`apps/api/src/contract/contract.test.ts` enforces the mechanical rules. Background and the generator findings are in `.planning/research/2026-09-25-api-split-spikes.md`.

## Clients

- Web: `openapi-typescript` generates `apps/web/app/lib/api/schema.d.ts` (with `--default-non-nullable=false`).
- iOS: Apple's `swift-openapi-generator`.
- Android: `openapi-generator -g kotlin` with `enumUnknownDefaultCase=true` and kotlinx serialization.

Clients authenticate with a Clerk session token in `Authorization: Bearer <token>` and read `GET /v1/client-config` at launch for the minimum supported app version.
