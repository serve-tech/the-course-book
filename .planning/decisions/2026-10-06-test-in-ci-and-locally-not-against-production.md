# Test in CI and locally, not against production

**Date:** 2026-10-06
**Status:** Accepted

## Context
`pnpm smoke:staging` signed a throwaway Clerk development user into the deployed Render services and created and deleted data. Those services are production, and since 2026-10-05 production uses the Clerk production instance, so the script's `sk_test_` key guard cannot tell staging from production and the script cannot work against production at all. Its cleanup also deleted the Clerk user even when deleting the account through the API had failed. A second free set of Render resources is not available: Render allows one free Postgres database per workspace, and production uses it. Free databases also expire every 30 days.

## Options Considered
1. **CI and local only:** CI already runs the real API image, the static web app, Postgres and a Clerk development instance on every pull request (`verify`, `browser` and `docker`), and `pnpm dev` and `pnpm test:e2e` do the same locally. Pro: no new infrastructure or cost, and nothing can touch production data. Con: nothing exercises the deployed Render services and their configuration end to end.
2. **A staging environment on Render:** possible once production's database is on a paid plan, which makes a free staging database possible again. Pro: exercises the real hosting setup. Con: needs the paid production database first, the free staging database expires every 30 days, and it needs its own Clerk development instance and names.
3. **Render preview environments per pull request:** Pro: isolated deploy per change. Con: cost and free-tier support are unverified, and each preview would need its own database and Clerk configuration.

## Decision
The maintainer chose option 1 on 2026-10-06. Retire the smoke script and its `smoke:staging` scripts. Verification happens in CI and locally. A staging environment can be revisited later.

## Consequences
- `tests/e2e/staging-smoke.ts` and both `smoke:staging` scripts are deleted.
- Automated tests never sign into production or create or delete real records. A check against production needs explicit maintainer authorization, a defined account and a cleanup plan.
- Deployed-service configuration problems are caught by hand after a deploy, not by an automated check.
- The cutover runbook keeps its original step 1.4 as history, with a note that the script was retired.
- The stray Pinehurst course named in the issue is not in the production database: it was left in the old Oregon database, which no longer exists. Every Pinehurst row in production is a ranked catalog course from the 2026-09-15 seed, checked read-only on 2026-10-06. No cleanup is needed.
