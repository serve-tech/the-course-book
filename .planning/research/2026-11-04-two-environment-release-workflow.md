# Spike: Two hosted environments and a small team's release workflow

**Date:** 2026-11-04
**Status:** Complete — recommendation only; not an accepted decision
**Question:** With 3–4 collaborators and two hosted environments, what should the second environment do, and does the team need a permanent development branch?

## Context

The maintainer wants a hosted place to test upcoming changes and a practical team workflow. Today feature branches go through PRs to `main`. The repository configures both Render services to deploy `main` after CI passes. This investigation inspected repository configuration and official guidance, not the live Render services. No infrastructure or deployment settings were changed.

Prior work: [CI and local testing decision](../decisions/2026-10-06-test-in-ci-and-locally-not-against-production.md) explicitly deferred staging. Its free-production-database constraint is historical: current `render.yaml` declares paid API and database plans. [Hosting research](2026-09-25-free-tier-hosting.md) provides earlier cost context. [Doppler decision](../decisions/2026-10-05-doppler-is-the-single-source-of-truth-for-render-environment-variables.md) remains the configuration model.

## Options

### A. Main deploys to staging; an approved commit releases to production

**What:** Keep short-lived feature branches and PRs into `main`; separate integration from production deployment.
- Pros: one integration branch, combined changes tested before release, exact release provenance, straightforward daily or on-demand releases.
- Cons: requires a release workflow and a change to today's automatic production deployment rule; one shared staging slot needs coordination.
- Fit: recommended if the team wants a regular hosted acceptance step before release.

### B. Main still deploys to production; staging previews one PR

**What:** Deploy a selected PR commit to the shared staging services, test it, then merge through the existing checks.
- Pros: preserves current merge-to-production workflow and supports pre-merge product review.
- Cons: only one preview at a time; a branch's migrations can leave the shared database incompatible with another branch; the final merge result can differ from the preview.
- Fit: good smaller alternative if hosted review is occasional. Update with main and retest the combined result before merge; final CI remains mandatory.

### C. Feature branches merge into develop, then develop releases into main

**What:** Add a permanent integration branch and batch releases into the production branch.
- Pros: maps branches to development/release phases and accommodates versioned release management.
- Cons: extra merge paths, bigger batches, synchronization of production fixes, more work deciding which features can ship together.
- Fit: unnecessary overhead for this team's single hosted application. Multiple supported versions or lengthy release stabilization could justify release branches later, without requiring a permanent develop branch.

## Comparison

| Concern | A: Main + release approval | B: Shared PR preview | C: Develop + main |
| --- | --- | --- | --- |
| Hosted test target | Integrated release candidate | One selected PR | Develop's combined state |
| Production release | Approved main commit | Merge after checks | Merge develop into main |
| Branch complexity | Low | Low | Higher |
| Release workflow change | Required | Minimal | Required |
| Shared staging contention | Coordinate candidate testing | Coordinate every preview | Coordinate candidate testing |

## Recommendation

Use **Production + Staging**, with local development and CI providing the other test environments without occupying hosted slots. Prefer option A if hosted acceptance before release is the intended normal practice. Keep PRs small, review promptly, and keep `main` deployable. Temporary feature flags can hide unfinished behavior; they do not make incompatible schema changes safe.

Suggested release sequence:
1. Develop and test locally on a short-lived feature branch.
2. Review the PR and pass the existing required checks before merging to `main`.
3. After the merged commit passes CI, deploy that commit to staging.
4. Hold staging on that candidate during acceptance testing. Queue subsequent staging deployments while developers continue merging.
5. A teammate tests the affected workflows, including phones, authentication, share cards and hosting-specific behavior as applicable.
6. Approve and release the exact tested commit to production. Record the candidate and both service deployment results; a newer main commit requires fresh testing.

This intentionally changes the current `AGENTS.md`/Blueprint rule that `main` automatically deploys to production. It needs agreement, a recorded decision, and corresponding workflow/docs/Blueprint changes before implementation. Preserve CI gating in the release workflow; a manual Render deploy does not itself prove checks passed. Account for Blueprint syncs as another deployment path.

## Staging resources and fidelity

- Give staging its own web service, API, database, URL and Doppler configuration. Never point it at production's database or reuse production identity credentials. Populate representative test members, friendships and rankings rather than copying private member records.
- Use the same deployment shape, migrations, database major version, routes and headers as production. Smaller capacity is reasonable, but cannot validate production performance.
- Clerk recommends a separate application for staging and configuring that application's production instance on a staging domain. Its development instances differ in session behavior; reusing development auth is a lower-fidelity compromise. Keep identity configuration aligned deliberately because it does not sync between applications.
- Existing `pnpm seed:dev` deliberately refuses nonlocal databases. A hosted fixture workflow would need its own reviewed target guards; do not bypass that restriction.
- Show a staging label and commit identifier. The team should know who is using the slot and what is deployed.
- Use staging for browser/device checks, demonstrations and release acceptance. Early feature previews can borrow it when no release is being tested, but candidate validation must restart afterward. Branch-specific migrations make this more complicated; resetting test data still requires explicit confirmation.
- Keep migrations compatible with the previous release. Rolling back application code does not roll back database changes. Never copy the staging database to production as a release step.
- The static web build embeds `VITE_*` values. For today's architecture, releasing the same source commit requires separate environment-specific web builds; it is not byte-identical artifact promotion. Reuse an immutable API image when supported by a future pipeline, without requiring that extra machinery now.

## Render constraints verified

- Hobby projects allow two environments. An environment groups resources; adding an environment does not provide free copies of the services.
- Full preview environments require Pro or higher and provision separate resources. They are a later option if shared staging becomes a bottleneck.
- Render supports deploying a specific commit. Dashboard and deploy-hook methods disable automatic deploys; CLI/API methods do not. A controlled release workflow must explicitly prevent automatic production deploys from replacing the approved commit.
- Free Postgres expires after 30 days. Use a small paid database for durable staging rather than relying on recurring replacement. Exact cost and account entitlements were not assessed.

## Open questions / next steps if accepted

- Choose option A's regular acceptance/release step or option B's occasional pre-merge previews.
- Agree on staging cost and who owns a release; keep the initial process to one reviewer and a short acceptance checklist.
- Prepare an infrastructure/workflow PR and an ADR that supersedes the relevant local-only testing and auto-production-deploy rules.
- Design safe hosted fixtures, staging identity/domains and a serialized candidate deployment job with a visible commit SHA.
- Verify GitHub plan/approval features and Render workspace resources before selecting the approval mechanism; neither was assumed available.
- Provision and deploy only with explicit authorization. This document authorizes nothing.

## Sources

- [GitHub flow](https://docs.github.com/en/get-started/using-github/github-flow): branch, PR, review and merge.
- [DORA: Trunk-based development](https://dora.dev/capabilities/trunk-based-development/): frequent integration and small batches; long-lived branch costs.
- [Gitflow author and retrospective](https://nvie.com/posts/a-successful-git-branching-model/): simpler workflows for continuous delivery; versioned software considerations.
- [Render projects and environments](https://render.com/docs/projects): grouping, two-environment Hobby limit and isolation controls.
- [Render deployment behavior](https://render.com/docs/deploys): CI gating, specific commit deployment and auto-deploy effects.
- [Render preview environments](https://render.com/docs/preview-environments): Pro requirement and per-PR copies.
- [Render free services](https://render.com/docs/free): Postgres expiration.
- [Clerk environments](https://clerk.com/docs/guides/development/managing-environments): independent staging application and development/production auth differences.
