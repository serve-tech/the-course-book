# Move The Course Book to Serve Electric Incubator

**Date:** 2026-09-18
**Status:** Accepted

## Context

The owner wants collaborator access isolated from other Serve Electric projects. Incubator's Free project creation was blocked because the owner's Scotland 2027 membership already counted two active free projects. The repository also had a failing Supabase check because its retired-project baseline did not match the original project's migration history.

## Options Considered

1. Transfer the project: requires source Owner permissions and still needs quota.
2. Upgrade Incubator to Pro: adds an organization subscription.
3. Use paid staging, pause the original, and copy into Incubator: releases a free slot after a verified copy exists.

## Decision

At the owner's explicit request, use option 3. The verified staging project is `burpqttaaoisawyikowz` in Serve Electric. Original Top100Golf `zcblgnjfdrdccbpgmhzr` is paused, with data intact. Production is now `naawqzwvegqbhioqqzkh` in Serve Electric Incubator (`bnsettpggrnfgisqweka`), in us-east-2. Copy all application data, account IDs/password hashes, schema, access policies, and Auth/SMTP settings. Keep GitHub Pages and the email sign-in fix.

## Consequences

- Original and final databases are independent snapshots; no cross-project data synchronization is configured.
- Users sign in again with their existing email/password. Auth sessions were not copied.
- Mike's original site cannot access its backend while that project is paused. Restoring it later requires available free-project quota or paid billing.
- The final runnable migration is the actual applied Incubator baseline. The retired baseline is archived outside supabase/migrations.
- Original production Git sync is disabled. No native Supabase deployment connection was added for the final project; future database changes are manual and must pass the read-only migration-history check.
- Incubator remains owned by JoshLinneburg; no collaborators were invited and no existing memberships were changed.
- Staging remains as a verified fallback until its deletion is explicitly authorized.

See [verification](../../docs/incubator-migration-2026-09-18.md).
