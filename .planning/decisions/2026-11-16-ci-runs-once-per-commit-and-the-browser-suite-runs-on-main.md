# CI runs once per commit, only the jobs a change needs, and the browser suite runs on main

**Date:** 2026-11-16
**Status:** Accepted

## Context

GitHub Actions cost about $2 on a busy day. On 2026-11-16 (UTC) the repository used 255 billed minutes in 32 runs; the Free plan's 2,000 minutes would last about eight days like that. The maintainer wants to get through a month on the free tier (#85).

Measured from each job's start and end times:

- Every commit on a pull request ran the workflow twice, once for the `push` trigger (`feat/**`, `fix/**`, `hotfix/**`) and once for `pull_request`: 115 of the 255 minutes.
- One run bills about nine minutes, because GitHub rounds every job up: `verify` 2 to 3, `browser` 5, `docker` 1.
- Every run did everything. #78 changed only `render.yaml`, which CI does not test, and cost five full runs.

The maintainer had already cut usage this way in `serve-tech/serve-meters#490` ("run only the jobs a change needs, on pull requests and on main"). Watching two browser runs for one commit, they asked whether the browser suite needs to run on every push at all, or only on merges.

## Options Considered

For the browser suite:

1. **On every push to a pull request (as before)**
   - Pros: a broken flow is caught before merging.
   - Cons: five of every run's nine minutes, repeated for every push and every "update branch".
2. **On main after the merge, and by hand on a branch (chosen)**
   - Pros: a pull request push costs 3 to 4 minutes instead of 9; Render deploys a commit only after its checks pass, so a failing suite still holds the deploy.
   - Cons: a broken flow is caught after merging, so `main` is red until a fix lands; it leans on the suite being run locally before pushing, and on Render's gate, which has let a deploy through early twice (#35).
3. **A merge queue**, which runs checks on the merged result before it lands
   - Pros: catches it before `main`, once per merge.
   - Cons: for private repositories it needs GitHub Enterprise Cloud.
4. **A label or review that starts it on a pull request**
   - Pros: before merging, on request.
   - Cons: every label or review event starts another run; the manual "Run workflow" covers the same need with no new trigger.

For deciding which jobs run:

1. **A separate "detect changes" job**, as serve-meters has
   - Cons: it bills a minute of its own on every run, which cancels most of the gain when a full run is nine minutes.
2. **`verify`'s first step decides (chosen)**: no extra job, and the three required check names stay.

## Decision

- **One run per commit.** The workflow starts on `pull_request`, on `push` to `main`, and by hand (`workflow_dispatch`). A push to a branch starts nothing by itself.
- **A newer push to a pull request cancels the run before it.** Never on `main`: Render waits for a commit's checks, and a cancelled run would leave it undeployed.
- **Only the jobs a change needs**, on pull requests and on `main` (a push to `main` is compared with the commit before it). Prose, planning notes, `render.yaml` and settings need none; unit tests need `verify`; the image is rebuilt only for what its Dockerfile copies. The rule is `.github/scripts/ci-jobs.mjs`, a tested function. It fails open: when the files cannot be listed, or the workflow or the rule changed, everything runs.
- **The browser suite never runs on a pull request.** It runs on `main` after the merge and from "Run workflow". Application changes are run through it locally before they are pushed, which `docs/testing.md` already asked for and is now the only browser run before a merge.
- **`verify` always starts**, because Render does not deploy a commit with no checks. A skipped job counts as passed for GitHub's required checks and for Render ("success, neutral, or skipped"), so branch protection and `render.yaml` do not change.

## Consequences

- A pull request push costs about 3 minutes for a web change and 4 for an API change, against 18 before. A docs-only push costs 1. A merge costs what its change needs: up to 9.
- When the suite fails on `main`, the deploy is held and the fix is another pull request. Nothing reverts by itself.
- If #35 recurs (Render deploying before `main`'s checks finish), a broken flow could reach production before the suite fails. Fixing #35 matters more now.
- Agents and people must run `pnpm test:e2e` locally before pushing application changes; a green pull request no longer says the browser suite passed.
- Left for the maintainer in #85: skip `main`'s run when its tree is exactly what the pull request tested; stop requiring up-to-date branches; run nothing on drafts; halve the browser job with a second pair of Clerk test users.
