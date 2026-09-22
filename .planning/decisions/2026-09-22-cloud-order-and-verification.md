# Preserve the implemented cloud-order contract during CI repair

**Date:** 2026-09-22
**Status:** Accepted (records the behavior already implemented on September 21)

## Context
Commit `0641ed9` made `user_courses.personal_rank` authoritative whenever cloud memberships exist. Colocated reconciliation tests explicitly cover this behavior, but the browser tests and contributor guidance retained the original local/round-first ordering assumptions. Main at `ba18f4a` failed four browser cases while Pages still deployed successfully.

Supabase Preview independently failed because applied migration `20260921154114_backup_before_course_cleanup_20260921` was absent from Git.

## Options Considered
1. **Revert cloud ordering to satisfy old browser tests**: would undo the contributor's deliberate implementation and unit-test changes.
2. **Align browser tests and documentation with the implemented contract**: preserves recent work while testing actual moves, persisted ranks and round-count behavior.

## Decision
Use option 2. Cloud membership ranks determine the hydrated list; round-only courses follow them. Local order is a fallback when no cloud memberships exist. Startup/logging must not rewrite ranks, and ownership/revision checks still reject stale hydration.

Choose drag targets by course identity and assert a real before/after change, backend persistence, hidden-course retention and reload behavior. Require browser checks in the Pages build job before artifact upload so direct main pushes cannot publish with failing browser tests.

Restore the missing migration's exact SQL, version and name from the live ledger. Do not edit applied history or rerun SQL to make the check green. The recovery itself changes repository history only.

## Consequences
- The original migration's local-order/fresh-device-order notes are historical and are superseded for these behaviors.
- Deployment performs browser checks even though the separate verification workflow also runs them; this small duplication avoids coupling independent workflows or bypassing checks on direct main pushes.
- Migration recovery changes no database permissions or stored data. Further database changes require explicit authorization.
