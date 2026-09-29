# Import Supabase member data 1-for-1

**Date:** 2026-09-28
**Status:** Accepted

## Context

Cutover moves the old app's member data from the retired Supabase project into the new Postgres database and Clerk ([cutover.md](../../docs/cutover.md) steps 3-4). The first importer silently skipped rows it could not place, did not validate its CSV input, and merged list entries whose courses looked equivalent, moving their rounds onto the kept course. A direction review asked for every source row to be accounted for.

The rehearsal export (2026-09-28: 11 members, 1,390 courses, 286 list entries, 711 rounds) showed that 3 of the 8 planned merges came from a bug, not from duplicate data: the canonical-location table in `apps/api/src/domain/identity.ts` matches on normalized names, so "The Glen Club" in Glenview, IL (Illinois list #32) is relabeled as North Berwick, Scotland, and the equivalence rule then treats it as the Scottish course. Two members have the Illinois row on their list without rounds next to The Glen in North Berwick with rounds, most likely because the old app (which had the same table) showed the Illinois row as North Berwick. The maintainer also considered starting fresh instead of importing.

## Options Considered

1. **Start fresh** (members sign up again and re-enter their lists)
   - Pros: no importer, no freeze and snapshot, simpler cutover.
   - Cons: loses list order, round history (dates of 711 rounds) and passwords; rejected by the maintainer.
2. **Import with merges and corrections** (fold look-alike entries, fix the canonical-location bug, remap the two Illinois entries)
   - Pros: cleaner lists.
   - Cons: changes members' data on the way in, guesses intent, and depends on rules that proved wrong on real data.
3. **Import 1-for-1** (copy what is stored; document known issues; change only what the new schema forces)
   - Pros: nothing is lost or reinterpreted; every change is visible in the report; corrections stay separate, reviewable decisions.
   - Cons: known oddities carry over (duplicate catalog rows appear as separate entries; the mislabeled course stays mislabeled).

## Decision

Option 3, by the maintainer: "import whatever would result in a 1-for-1 with the existing data ... keep it as-is even if it's not right and make note of it."

- Every list entry and round keeps its own course and notes. Nothing is merged, moved or corrected.
- Every exported row gets exactly one ledger outcome (imported, already in the catalog, or a problem). Any invalid row or problem stops the import before it writes; there is no "accept and continue".
- Only schema-forced changes happen, and the report states them: ranks are renumbered 1..N in their existing order (the new schema has contiguous unique ranks), and a course with rounds but no list entry gets one at the bottom (rounds require a membership; the old app showed such courses there).
- Members keep their passwords: Supabase's bcrypt hashes are imported into Clerk (`passwordDigest`, `passwordHasher: "bcrypt"`), with the Supabase id as Clerk's external id. Google members sign in with Google, which Clerk links by verified email.
- After writing, the importer verifies every member's list order, ranks and round ids against the plan.

Implementation: `apps/api/scripts/import/` (`rows.ts`, `plan.ts`, `run.ts`).

## Consequences

Known issues carried over as-is (to decide separately, after cutover):

- The canonical-location table relabels "The Glen Club" (Glenview, IL) as North Berwick, Scotland in the live app; two members have that entry beside The Glen in North Berwick.
- Duplicate catalog rows exist for Blackwolf Run: River and PGA West: Stadium Course (one row of each lacks a city), and "Innisbrook Resort: Copperhead" exists under two names; members who listed both rows see two entries.
- The rehearsal snapshot renumbers four members' ranks (duplicate, one missing and a few skipped ranks in the old data), keeping their order.
- `times_played`, `first_played` and `last_played` are not imported; the old app displayed play counts from rounds, which are imported (8 entries' stored counts differ from their rounds).

The export includes password hashes, so `.import/` is deleted once the import is verified. A rerun is safe only before members use the new site.
