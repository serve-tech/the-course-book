# Incubator migration verification

Date: 2026-09-18

**Historical verification snapshot:** Resource plans/health, staging availability, row counts and check results below describe observations at this migration, not continuous current status. See [README.md](../README.md) for current development and deployment instructions. The React migration followed this infrastructure cutover.

## Resources

- App: https://serve-tech.github.io/the-course-book/
- Final Supabase project: `naawqzwvegqbhioqqzkh`, The Course Book, Serve Electric Incubator, us-east-2, Free plan.
- Staging: `burpqttaaoisawyikowz`, The Course Book, Serve Electric, Pro plan.
- Original: `zcblgnjfdrdccbpgmhzr`, Top100Golf, Scotland 2027, paused at the owner's request after staging verification.

## Copy and verification

| Table | Rows |
| --- | ---: |
| auth.users | 11 |
| auth.identities | 11 |
| public.profiles | 11 |
| public.courses | 1482 |
| public.course_rankings | 1430 |
| public.user_courses | 300 |
| public.rounds | 711 |
| public.course_ranking_import | 300 |
| public.course_merge_backup_20260915 | 101 |

The fresh source snapshot included three course-list entries added since the first migration. Every row, including account IDs/password hashes, matched in staging and in the final project. Before pausing, the original was rechecked against the verified staging snapshot. The final import snapshot was read from staging.

All application table/column definitions, constraints, indexes, RLS settings/policies, grants/default privileges, signup trigger, and application function matched. There were no Storage buckets/objects, deployed Edge Functions, MFA factors, or SSO providers to copy. Imports were transactional, and no schema or application rows were changed in the original.

Rollback-only tests verified signup profile creation, own-user round and list writes, rejection of cross-user round insertion, private round visibility, and anonymous catalog/ranking access. All temporary test records were rolled back.

Auth settings, password policies, email templates, and SMTP configuration were copied with updated final-project/site URLs. A secure Resend SMTP login succeeded; no email was sent. Existing sessions were not migrated.

## Migration failure resolution

The old check reported `Remote migration versions not found in local migrations directory`: the original project's three ledger versions were absent locally, while the repository contained a baseline for a different, deleted project.

The runnable directory now contains `20260918134813_course_book_incubator_baseline.sql`, matching the final project's applied ledger. The retired baseline is archived at `docs/archive/20260917142631_port_existing_course_book.sql`. The original project's production Git branch mapping was cleared before it was paused. Future database migrations are manual until an Incubator integration is deliberately configured.

`node scripts/check-migration-history.mjs` provides a separate read-only check against the backend selected by `src/infrastructure/supabase/public-config.json` (the shared configuration introduced by the React migration). Regression tests cover the original mismatch, aligned histories, pending migrations, malformed versions, and duplicates.

## Existing follow-up items

Access policy behavior was preserved. Security advisor findings match the inherited schema: two auxiliary tables without RLS, pg_trgm in public, broad execute permissions on the signup function, and disabled leaked-password protection. These are separate security-hardening work, not new migration regressions.

The staging project remains available as a fallback and continues to incur its paid compute charge until explicitly deleted. No collaborator invitation or membership change was performed.

## Release checks

Cutover commit `689029f` deployed successfully through GitHub Pages. All nine authentication/migration-history tests passed. The live read-only migration preflight found no missing or pending migration versions. Public API checks returned the full 1482-course and 1430-ranking catalogs with the correct Pages-origin CORS response; Auth settings were reachable. The final project is ACTIVE_HEALTHY. The old Supabase Preview check is now skipped because its former production Git mapping is disabled; no failing checks remain on the cutover commit.

Live browser checks also passed: the app requested only the final Supabase host; World, USA All, and USA Public each rendered 100 courses; no JavaScript errors or failed normal app requests occurred. Sign-in was intercepted locally and verified to submit the visible email to the final project. No real authentication request was sent.
