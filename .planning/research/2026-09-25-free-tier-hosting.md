# Free-tier hosting for coursebook.golf (Render + Postgres)

**Date:** 2026-09-25
**Question:** Can the rebuilt app run with no credit card and no monthly cost, and does a static site plus API beat the server-rendered app on cost?
**Status:** Research complete; decision pending with the maintainer.

## Render (docs fetched 2026-09-25)

- Card: docs say free resources need no payment method (https://render.com/docs/free), but Render staff state a card may be demanded "for verification" at Render's discretion; triggers are undocumented. Omitting `plan` in a Blueprint defaults to paid plans (https://render.com/docs/blueprint-spec).
- Plans renamed 2026-08-26: `starter` = `0.5c-512mb` ($7/mo), `basic-256mb` = `0.1c-256mb` ($6/mo + storage). `free` unchanged (https://render.com/docs/compute-plans-update).
- Free web service: 0.1 CPU / 512 MB, Docker allowed, spins down after 15 min without inbound traffic, spin-up "about one minute", 750 instance hours/workspace/month, Hobby workspace 5 GB outbound bandwidth and 500 pipeline minutes. No SSH, disks or scaling (https://render.com/docs/free).
- `preDeployCommand` is paid-only (https://render.com/docs/deploys#pre-deploy-command). Docker services cannot set a build command; run migrations in the container start command instead (https://render.com/docs/docker).
- Free Render Postgres expires 30 days after creation, then 14-day grace, then deletion with all data; no backups; one per workspace (https://render.com/docs/free). Not viable for real data.
- Keep-alive pings: not prohibited in ToS/AUP, but Render support (2024) called it "against the spirit of the free tier". A 24/7 service uses ~744 of the 750 hours.
- Static sites are free and do not sleep (https://render.com/docs/static-sites).

## Free Postgres (vendor docs, Sept 2026)

| Provider | Card | Storage | Idle behavior | Expiry / deletion | Backups | Near Oregon |
| --- | --- | --- | --- | --- | --- | --- |
| Neon Free | no | 0.5 GB/project, 100 CU-h/project/mo | suspends after 5 min, auto-resumes in a few hundred ms | none; limits suspend compute or block growth, never delete | 6 h PITR, 1 snapshot | aws-us-west-2 |
| Prisma Postgres Free | no | 500 MB, 200k operations/mo (every SQL statement counts) | scale to zero, no cold start claimed | undocumented at limits | none | us-west-1 |
| Supabase Free | not stated | 500 MB | pauses after 1 week of low activity; manual resume | restorable 1 year while paused | none | us-west-2 (direct is IPv6-only; use session pooler from Render) |
| Aiven Free | no | 1 GB, 20 connections | powered off when idle; manual power-on | deleted after 180 days off | 1 backup | region not selectable |
| Tiger free services | trial only on pricing page | 750 MB (beta) | unclear | trial data may be removed | unclear | us-east-1 only |
| Xata, Render free | - | - | - | expire | - | ruled out |

Sources: https://neon.com/docs/introduction/plans, https://neon.com/docs/introduction/scale-to-zero, https://www.prisma.io/pricing, https://supabase.com/docs/guides/platform/free-project-pausing, https://aiven.io/docs/platform/concepts/service-power-cycle, https://www.tigerdata.com/docs/about/latest/changelog.

## Findings

- Rendering model does not drive cost. A static SPA still needs an API server and the same database; on Render free that server sleeps identically, so data still waits ~1 min. SPA + API adds a second deployable and client state without saving money. (The split happened anyway, later the same day, for a different reason: native iOS and Android clients need a JSON API; see decisions/2026-09-25-split-into-json-api-service-for-web-ios-and-android.md.)
- The cost drivers are always-on compute and a durable database. Render free covers compute (with sleep); only an external free Postgres avoids the 30-day deletion.
- Neon fits the workload: plain `pg` over TCP, transaction-scoped advisory locks and deferred constraints work (transaction-mode pooler safe; run migrations over the direct endpoint), same AWS region as Render Oregon (Render does not document its underlying region).
- Neon caveats: suspend cuts idle connections (handle `pool.on("error")`); a keep-alive that touches the database 24/7 needs ~182 CU-h and exceeds the 100 CU-h cap; restore window is only 6 h, so real data needs our own `pg_dump` routine.
- Stacked cold start: after >15 min idle, Render's ~60 s spin-up dominates; Neon adds under a second.
- Upgrade path without re-architecture: Render `starter` web service ($7/mo) removes the sleep; Neon can stay free.
