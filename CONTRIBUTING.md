# Contributing to The Course Book

You can describe the change you want without designing the implementation. Repository agents should read [AGENTS.md](AGENTS.md) automatically when their tool supports it; the Claude and GitHub Copilot instruction files point to the same rules. A tool that does not load repository instructions needs AGENTS.md supplied as its entry point.

## For the person requesting a change

Describe the user-visible outcome, the screen it affects and how you will recognize success. For a bug, include the steps to reproduce and expected behavior. You do not need to prescribe folders, services or testing conventions.

For example: “On My List, let me filter by country while keeping my saved personal order. Clearing the filter should restore the complete list.”

The agent should inspect existing behavior, implement on a branch, add appropriate tests, update relevant docs and report verification. It should preserve behavior outside your requested change. Ask it to explain any proposed change to stored data or product behavior before that change proceeds.

Before approving a PR, look for a plain-language description of the outcome, relevant screenshots for UI changes, passing verification, and any untested behavior. You do not need to review every line to ask for that evidence. Automated checks reduce risk; they do not prove every live workflow.

## Set up locally

Use Node 24 LTS through the checked-in `.nvmrc` and npm:

```sh
nvm use
npm ci
npm run dev
```

Open http://localhost:5173/the-course-book/. If you do not use nvm, install a Node version allowed by `package.json`; Node 25 is unsupported by `package.json`.

No private credentials or environment file are needed to run the frontend. **The default configuration connects to production Supabase. Signing in and editing data locally changes live records.** Automated tests use mocked services; follow [testing](docs/testing.md) for verification without live writes.

## Make a change

1. Start from current `main` on a descriptive `feat/`, `fix/` or `hotfix/` branch.
2. Read [agent instructions](AGENTS.md), [architecture](docs/architecture.md) and the relevant existing feature/tests.
3. Identify the behavior to preserve and the acceptance checks for the requested change.
4. Keep feature code together. Extract pure logic and test it; use repositories for Supabase operations and services for multi-step workflows.
5. Run the checks in [testing](docs/testing.md), review the diff and update documentation affected by the change.
6. Commit logical units with Conventional Commits, push the branch and open a PR against `main`. Include what changed, why, test results and remaining limitations.

Avoid “cleanup” of course identities, caches, rank semantics or database history alongside unrelated UI work. These have compatibility implications explained in the architecture and migration notes.

## Preview and release

`npm run build` produces `dist/`; `npm run preview` serves it at http://localhost:4173/the-course-book/. The repository root's `index.html` is a Vite entry point, not a standalone production app.

GitHub Pages currently publishes the built app using GitHub Actions. Feature branches and PRs run verification without deployment. Merging or pushing to `main` triggers the Pages workflow.

**Check the PR's “Verify application” result before an authorized merge.** The Pages workflow runs its own lint, unit tests, build and browser tests before uploading the deployment artifact. Failed browser verification blocks publication, even for a direct push to main. It runs independently of the PR verification workflow.

No Render account or server deployment is needed. Keep the `/the-course-book/` base path and matching Supabase auth redirect unless a hosting change is explicitly part of the task.

## Where to find answers

| Question | Reference |
| --- | --- |
| What must my agent follow? | [AGENTS.md](AGENTS.md) |
| Where should a change go? | [Architecture](docs/architecture.md) |
| What must remain compatible? | [Architecture contracts](docs/architecture.md#compatibility-contracts), [migration notes](docs/react-migration.md) |
| What checks should run? | [Testing](docs/testing.md) |
| Which backend is current? | [README configuration](README.md#supabase-configuration-and-migrations), [public configuration](src/infrastructure/supabase/public-config.json) |
| Why was a design chosen? | [Decision records](.planning/decisions/) |

Dated migration reports are audit history. Local planning state is ignored by Git; committed instructions and decision records are what another machine receives.
