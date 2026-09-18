# React and TypeScript migration with behavior compatibility

**Date:** 2026-09-18
**Status:** Accepted

**Implementation:** [PR #1](https://github.com/serve-tech/the-course-book/pull/1) merged on 2026-09-18; GitHub Actions now deploys the React build to Pages. The consequences below record the original release plan. See [current contributor instructions](../../CONTRIBUTING.md) for subsequent changes.

## Context
The owner requested a branch-based rewrite preserving behavior and appearance. The baseline is b4b34b4. Existing local course identities, account caches, Supabase sessions, round history and personal order are compatibility contracts.

## Options Considered
1. **React, Vite and strict TypeScript**: static output fits GitHub Pages and Supabase; requires explicit feature and state boundaries.
2. **Server-rendered framework**: adds deployment and runtime complexity without a server-rendering requirement.
3. **Type annotations around the monolith**: retains global mutable state and coupled presentation/persistence.

## Decision
Use React with Vite, strict TypeScript, feature folders, pure domain functions and typed repositories. Separate database DTOs from application models. Preserve CSS and compare against a frozen legacy fixture. Retain existing Supabase publishable configuration and default session storage. Account operations capture their owner; stale responses cannot commit into another account.

Use Node 24 LTS and TypeScript 6.0.3, the newest TypeScript supported by the selected typed ESLint toolchain. Pin dependencies and commit the lockfile.

## Consequences
Require lint, type, unit, browser and production-build verification. Production remains on main until reviewed. GitHub Pages must publish Vite's built output after merge. No schema, account-data or authorization-policy changes. Characterize existing quirks before separate product corrections.
