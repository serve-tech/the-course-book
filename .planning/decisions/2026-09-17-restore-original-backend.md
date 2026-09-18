# Restore the original backend and defer Incubator migration

**Date:** 2026-09-17
**Status:** Superseded by [Move to Serve Electric Incubator](2026-09-18-move-to-serve-electric-incubator.md).

## Context

The owner wants to avoid giving collaborators access to other Serve Electric projects. A separate Serve Electric Incubator organization was created, but free-project quota blocked provisioning. The owner explicitly deferred its billing until next week and requested pointing the app back to Mike's original backend and deleting the Serve Electric copy.

## Options Considered

1. Transfer the replacement project: requires source Owner privileges, available target quota, and temporarily disconnecting its GitHub integration.
2. Create a fresh Incubator project: avoids transfer permissions but still requires resolving quota or billing.
3. Restore the original backend now: uses existing working infrastructure and defers the ownership migration.

## Decision

Use option 3. Keep the Serve Tech repository, GitHub Pages site, and sign-in fix. Connect to `zcblgnjfdrdccbpgmhzr` with its browser-safe publishable key. Add the Serve Tech Pages address to the original backend's allowed auth redirects while retaining its default site URL and SMTP configuration. Delete the Serve Electric replacement `pungabwkrqhnxruodurf` only after the deployed app is verified against the original backend.

## Consequences

- The Serve Tech site and Mike's original site use the same accounts and data.
- Users may need to sign in again after the backend switch.
- Before the switch, all seven public tables and auth identities matched exactly. Auth users matched except for last_sign_in_at and updated_at; passwords and account IDs matched.
- No data migration or schema change to the original project is required.
- Serve Electric Incubator (`bnsettpggrnfgisqweka`) remains empty, owned by JoshLinneburg, pending future billing/setup.
- The previous migration SQL remains a historical baseline, not an automatically applied source-project migration.
- Completed: GitHub Pages deployment `37ef11e` was verified in a browser against the original backend; all four auth regression tests passed. A final data comparison passed before deletion, and the replacement is now absent from the Supabase project list. The original remains ACTIVE_HEALTHY and Incubator has zero projects. No test email or real authentication request was sent.
