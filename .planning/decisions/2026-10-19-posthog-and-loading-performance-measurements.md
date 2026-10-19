# PostHog and loading performance measurements

**Date:** 2026-10-19
**Status:** Accepted

## Context

Members reported roughly five-second sign-in and tab changes. The API already logs total request duration and a server-generated request ID; there is no retained browser perspective. Free Render can explain an idle wake-up but cannot be assumed to explain every tab. The maintainer approved PostHog together with explicit measurements on a fresh branch from main.

## Options Considered

1. Browser console and existing API logs only: minimal setup, but remote phone complaints are hard to investigate after the fact.
2. Custom telemetry collector/database: retains measurements but adds avoidable storage, access and dashboard maintenance.
3. Managed PostHog browser events plus existing API logs: retained browser measurements, potential future product analytics/flags, and one new dependency/configuration pair.

## Decision

Use option 3. Start with explicit timing events, not session recording. Measure Clerk readiness/token waits, browser API response-header waits, route handlers, and approximate route content readiness. Correlate individual API calls with the existing server-generated request ID. Add server total/auth/provisioning timing headers and log fields; do not add a database collector or change domain services.

PostHog is optional and asynchronous. Load its slim browser bundle without unused feature extensions. Use its public project key and US/EU ingest origin from Doppler for production and `.env` for local development. No secrets enter the browser. Both absent disables collection; partial/invalid settings fail the build. Release comes from the existing hosting/CI commit environment. SDK and ingest failures must not fail application operations.

The final event allowlist excludes raw URLs, usernames, auth hashes, query parameters, credentials, request bodies and application data. Keep anonymous in-memory identity and device/browser categories; do not identify accounts. Disable automatic capture, session replay, exception capture and remote features. Respect Do Not Track. Configure the SDK's optional core-js donation-banner install script as disallowed; it is not needed at runtime.

## Consequences

- A PostHog project and Doppler values are needed before production collection is enabled. They are not created by this source change; an authorized release is still required.
- Browser events show experience; API logs show handling inside Node. Neither proves the network/cold-start cause without comparing evidence. Body parsing is included in route duration, not fetch-to-headers time.
- No schema migration, API JSON contract change, hosting upgrade, server-data cache, or authorization change.
- The existing opt-in layout preference and build-time shutoff remain as described in the [layout-preview decision](2026-10-19-opt-in-layout-preview-in-production.md). Remote rollout control is a future use of PostHog, not silently enabled by adding performance monitoring.
- Tests cover both enabled collection with a stubbed external collector and failure/disabled behavior. Operational setup and dashboard definitions live in [docs/performance.md](../../docs/performance.md).

References: [React Router instrumentation](https://reactrouter.com/how-to/instrumentation), [PostHog JavaScript SDK](https://posthog.com/docs/libraries/js).
