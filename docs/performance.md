# Loading performance

The browser sends explicit `coursebook_performance` events to PostHog. The API keeps its structured JSON request logs in Render. Join browser `request_id` to API `requestId` when investigating one slow request. This measures the reported delays; it does not assume the phone, database or free hosting is responsible.

## Configuration

1. Create/select a PostHog project. Under **Settings → Project**, copy the **Project API key** (`phc_…`, public). Never put a personal API key (`phx_…`) into the web app. See [PostHog installation](https://posthog.com/docs/libraries/js).
2. Set both web variables in the Doppler configuration that syncs to `coursebook-golf-web`:
   - `VITE_POSTHOG_KEY`: the public project key.
   - `VITE_POSTHOG_HOST`: `https://us.i.posthog.com` for US or `https://eu.i.posthog.com` for EU.
3. These values require a web rebuild. Coordinate configuration with an authorized release; a Doppler sync may trigger a deployment. Do not set them in Render's dashboard or `render.yaml`. Production configuration has not been completed merely because the code builds.
4. For local testing use a separate project and the same two values in `.env`, then restart the dev server. Both unset means no SDK download or browser collection. Partial or invalid configuration fails a build and disables monitoring with a warning during development.
5. In PostHog's live events, filter `coursebook_performance` and check `metric`, `environment`, `release`, `route` and `layout`. The build takes `release` from Render's `RENDER_GIT_COMMIT`, or `GITHUB_SHA` in CI, with `local` as fallback; no extra Doppler variable is needed.

## Measurements

Every duration is milliseconds, measured with the monotonic browser/server clock. The two clocks are never subtracted from each other.

| `metric` | Meaning |
| --- | --- |
| `clerk_ready` | Document navigation start until the Clerk provider is ready. Includes script/network/bootstrap time; does not measure time typing credentials. |
| `auth_token` | Awaiting Clerk's `getToken()`, with `source=loader` or `source=api`. Separate calls may overlap; do not sum them into a page total. |
| `api_headers` | Browser fetch start until response headers arrive (or a transport failure). Excludes token wait, body download and JSON parsing. Carries the OpenAPI endpoint template, HTTP method/status, server request ID and server durations when available. |
| `route_loader`, `route_action` | React Router handler duration, including token work, requests, response-body parsing and transformations. `route_id` distinguishes parent and child loaders. Concurrent loaders overlap. |
| `navigation_ready` | Initial document start, router navigation start, or observed revalidation start until an idle route is committed plus two animation frames. `navigation_kind` distinguishes initial/navigation/revalidation. It approximates visible content, not all images/fonts or a Web Vital. `outcome=ready` can include an error screen; use route/API outcomes to diagnose errors. |

Superseded transitions are discarded. Hidden-tab transitions are excluded at completion so background frame throttling does not inflate the ready samples. Route patterns replace usernames and list parameters; query strings and auth hashes are never sent. `layout` is the browser preference (Classic or course-first), not a randomized experiment assignment.

`route` identifies the destination for route handlers and content readiness. API/token/Clerk observations use `route=unknown`: concurrent requests cannot reliably infer their owning page. `visible_route` is the sanitized browser location when a measurement completes, which may still be the previous page while destination loaders run. Group API timings by `endpoint`, not by `visible_route`.

API `Server-Timing` contains `app`, `auth` (session verification) and `provision` (member resolution). The same totals appear as `ms`, `authMs`, `provisionMs` in each request log, alongside process `uptimeMs`. Authentication/provisioning durations are parts of the total, not additional time. Database work remains within app handling; this does not instrument individual queries or pool waits.

## Investigating a complaint

Create a **Loading performance** dashboard in PostHog with trends on `coursebook_performance`:

- Filter `metric=navigation_ready`, `navigation_kind=navigation`, `outcome=ready`, `environment=production`; graph the median and 95th percentile of `duration_ms`, broken down by `route`. Put initial loads and revalidations on separate charts.
- Compare `layout`, `release` and `$device_type` for the same route and period. Include sample counts; a handful of users cannot support a meaningful p95 comparison.
- Add separate charts for `auth_token` by `source`, and `api_headers` by `endpoint` and `outcome`. Track failures/timeouts separately from successful response latency.
- For a slow API event, search Render's API logs for its `request_id`. Compare browser header wait with `server_ms`, then inspect `server_auth_ms` and `server_provision_ms`. A long browser wait with a short server duration points to time outside app handling, but does not isolate network, preflight, proxy queue or cold-start wake-up. A low `uptimeMs` supports a recent process start; it is not proof of a Render cold start.
- Compare a first visit after inactivity with several immediate tab changes. Persistent warm-request delays need investigation even if upgrading Render removes cold starts.

Server durations exclude platform queue/wake time before Node accepts the request and socket delivery after the response is prepared. Browser and server intervals have different boundaries. Never label their difference as pure network latency.

Cacheable public responses may carry timings and a request ID from the original response. Use the private, `no-store` member endpoints when comparing current browser waits with current server work.

## Collection boundaries and reliability

The slim SDK loads asynchronously and queues at most 100 early application measurements. Unused recording and other feature extensions are not bundled into it. It sends only the explicit event through a final property allowlist; no raw URLs/referrers, account IDs, names, emails, course data, request bodies, authorization headers or error text. The public project token is retained because PostHog requires it for ingest. Browser/OS/device categories and anonymous SDK session identifiers are retained. Identity persistence is disabled and no account identification occurs, so reloads are not reliably joined into one person.

Autocapture, automatic pageviews, session replay, exception autocapture, surveys and remote flags are disabled. This first integration supplies performance data and layout comparisons; it does not change the existing visible layout toggle or make its build-time shutoff a remote flag. Broader recording or rollout management is a separate deliberate configuration/code change.

Do Not Track is respected. Blocked/unavailable PostHog and invalid measurements must not affect sign-in, requests or navigation. Measurements are best-effort and may be lost on an early page exit, blocked browsers or a network failure; this is diagnostic telemetry, not an audit log. Collection currently sends every explicit timing event when enabled; review volume before extending it.

## Verification

Unit tests exercise normalization, filtering, configuration, navigation timers, request failures and SDK failure isolation. API tests verify timings on success and error responses, correlation and CORS exposure. Browser tests intercept the real SDK's outgoing requests, exercise a delayed real API response, confirm navigation measurements and inspect the payload for personal URL data. Browser tests use a dummy project key and never send to a live collector.

Run database-backed Vitest and Playwright sequentially; they share the local test database. Local tests do not prove events reached the configured production PostHog project.
