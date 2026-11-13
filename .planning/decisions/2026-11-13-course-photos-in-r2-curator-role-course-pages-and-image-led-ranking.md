# Course photos in Cloudflare R2, a curator role, course pages and an image-led ranking

**Date:** 2026-11-13
**Status:** Accepted, with R2 waiting on approval

**Amendment (2026-11-13, later the same day):** using Cloudflare R2 needs the maintainer to get approval first. Until then, course photos are Wikimedia Commons files loaded directly from `upload.wikimedia.org`, and the curator screen offers Commons search only. The `course_photos` table, the curator role and the API's `photo` field are built now. R2 storage, uploads and copying the Commons photos into R2 are issue #67. Server requests to Commons identify the app with `https://coursebook.golf` as the contact, per Wikimedia's User-Agent policy.

**Amendment (2026-11-13, lists):** the Courses page's Top lists and a member's list (`/u/<username>/lists/<list>`) use the ranking's photo cards too, at the maintainer's request, keeping their ticks, friends and Log a round / Want to play buttons. Those lists hold 290 courses no member may rank, so curators can also work through a national list on `/curate` (`?from=`). Best in State (1,130 courses) is not offered there. `/v1/rankings` keeps its hour-long browser cache, so a new photo can take an hour to reach pages built from it; the curator screen revalidates.

## Context

The maintainer's assessment, 2026-11-13: the app looks plain and uninspired, and that is now the biggest problem. Courses have no pictures (`CourseTile` is typographic because the catalog has logos for 9 of 1,417 courses), there is no page for a single course, and Home's ranking is a condensed list. The maintainer pointed to Top 100 Golf Courses as the model for both a course page (full-width hero photo with the name on it, a Want to Play / Played pill, facts, rankings) and a ranking listing (large numeral, landscape photo card with ranking badges and heart/star actions, a card/compact toggle and a 10/20/…/100 jump rail).

Findings that shaped the decision:
- Photos can only come from free-licensed or permitted sources. Top 100's photos, course websites and image search results are copyrighted. The 2026-10-19 Commons search found a usable course photo for 41 of the World Top 100 and 21 of the USA Top 100, and 5 of the maintainer's own top 10; Michigan courses were not searched.
- Members only need photos for courses on members' lists (282 list entries across 12 members on 2026-10-28), not the whole catalog.
- Commons allows linking files directly but "is not recommended", so Commons photos are copied too, and storage is needed either way.
- Render disks prevent zero-downtime deploys and keep a service to one instance (render.com/docs/disks), which breaks the API's deploy model (migrations run while the previous release serves). Render Object Storage is in early access.
- Google Places photos were rejected: photo names cannot be cached, every photo needs Google Maps attribution plus the author's name and a link, it is metered, and quality is uncurated.

## Options Considered

1. **Cloudflare R2 (S3-compatible bucket)** — standard object storage.
   - Pros: generally available, cheap, S3 API keeps the choice reversible, CORS for the canvas-drawn Save image.
   - Cons: a new vendor, an exception to the all-Render preference.
2. **Render Object Storage** — S3-compatible, stays on Render.
   - Pros: no new vendor.
   - Cons: early access; not for production yet.
3. **Render persistent disk on the API**
   - Pros: no new vendor.
   - Cons: no zero-downtime deploys, single instance.
4. **Postgres `bytea`**
   - Pros: no new vendor, backed up with the data.
   - Cons: non-standard; bloats the database, its dumps and API traffic.
5. **Google Places photos** — rejected for the reasons above.

## Decision

- **Storage: Cloudflare R2**, accessed through the S3 API so a later move (for example to Render Object Storage once it is generally available) is a configuration change. This is the one accepted hosting exception for files; the UI, API and database stay on Render.
- **One photo per course, curated.** Each photo carries a credit, a source and a license or permission; it cannot be saved without them, and the credit is shown on the photo. Courses without a photo keep a designed fallback.
- **A curator role.** One role field on the member in our database (member, curator, admin). Curators set a course's photo by uploading one or by picking from a Wikimedia Commons search; admins grant the curator role. The API makes every authorization check. Uploads are resized server-side and stripped of location metadata.
- **A course page** modelled on Top 100: hero photo with name and place, the member's actions on the course, published rankings, and what Top 100 cannot show (the member's rank, friends who played it and where they rank it). No editorial description or reviews.
- **An image-led ranking, mobile-first.** Photo cards for browsing; a Reorder mode switches to compact rows with small thumbnails for dragging. The call to action (Want to play, Played) lives on the cards and the course page rather than being designed afterwards.
- **Order:** (1) course page and photo cards on a branch with hand-placed Commons photos for the maintainer's top 10, to judge the look locally; (2) roles, the curator screen and R2; (3) ship the course page and cards once most courses on members' lists have photos; (4) #52 Played and Ranked and #58 placement, which make Played one tap. The maintainer confirmed that individual rounds no longer matter.

## Consequences

- Amends the ranking-first build order (2026-11-03): the visual work goes ahead of #52 and #58. Until #52 ships, Played on a card opens Log a round.
- New configuration for R2 (account, bucket, access keys, public base URL) goes in Doppler, `apps/api/src/services/env.ts`, `.env.example` and docs/architecture.md together.
- The contract grows: a single-course read operation, a photo field on courses, and curator operations.
- The Save image canvas draws photos only from a CORS-enabled origin; R2's public bucket or custom domain must send CORS headers.
- Supersedes the photo-hosting note in 2026-10-19-course-first-home-and-direct-list-navigation.md ("no storage provider is selected").
