# Process course photos with sharp in the API image, and store them in R2 through a small S3 client

**Date:** 2026-11-15
**Status:** Accepted for the draft PR; switching it on waits for the maintainer's Cloudflare setup (#67)

## Context

Issue #67 adds curator uploads and our own copies of Commons photos in Cloudflare R2, which the maintainer approved on 2026-11-15. The 2026-11-13 decision already said uploads are resized on the server and stripped of location metadata. Three things made the image processing the hard part:

- The API image has no `node_modules`. `apps/api/build.ts` bundles everything into one file with esbuild, and CI's `docker` job checks the image starts that way. A native module can't be bundled.
- The API runs on Render's starter plan: 512 MB and half a CPU, one instance. Migrations run at start while the old release still serves.
- Phones send 3 to 12 MB photos, and some send 48-megapixel ones. Every client (web now, iOS and Android later) must get the same privacy guarantee: no location in a stored photo.

R2 is reached through its S3 API. Cloudflare documents `aws4fetch` for it (https://developers.cloudflare.com/r2/examples/aws/aws4fetch/); signing uses the region `auto` (https://developers.cloudflare.com/r2/api/s3/api/).

## Options Considered

1. **sharp in the API image** (sharp 0.35.5, libvips 8.18.7). Mark it external in the bundle and ship its files beside the bundle; the image is Alpine, so the musl build.
   - Pros: the standard Node library; decodes JPEG with shrink-on-load, so a 48 MP photo is never fully decoded; strips all metadata by default (https://sharp.pixelplumbing.com/api-output#keepmetadata); the server enforces privacy and sizes for every client.
   - Cons: about 20 MB of native files in the image; the image is no longer "no node_modules"; a sharp upgrade is a native upgrade.
2. **Resize in the browser; the API only validates and strips metadata bytes.**
   - Pros: no native dependency; smaller uploads on mobile networks.
   - Cons: every future client must resize; the server would have to parse and rewrite JPEG/PNG/WebP containers by hand to strip metadata, which is easy to get wrong; it can't make WebP sizes itself.
3. **A WebAssembly codec bundled into the API** (sharp's `@img/sharp-wasm32`, or Squoosh-style codecs).
   - Pros: no native binary for the platform.
   - Cons: sharp's wasm build is 9.3 MB and needs worker threads, so it still ships beside the bundle rather than in it; Squoosh-style codecs decode the whole image into memory (192 MB of pixels for 48 MP before any resize) and run slower on half a CPU.

## Measurements

Option 1, the real API image built from this branch, run with `--memory=512m --cpus=0.5` (Render starter), uploading through the API to an S3 emulator (VersityGW). Peak is the Node process's peak resident memory (VmHWM); idle was 105 MB in these runs (134 MB to 144 MB right after start, with and without sharp loaded). Synthetic photos: blurred noise, the worst case for a JPEG decoder at a given size.

| Photo | File | Time | Peak memory |
| --- | --- | --- | --- |
| 12 MP baseline JPEG (4032 × 3024) | 2.8 MB | 1.4 s | 151 MB |
| 48 MP baseline JPEG (8064 × 6048) | 11.1 MB | 2.1 s | 205 MB |
| 48 MP progressive JPEG | 11.1 MB | 3.7 s | 293 MB |
| 48 MP progressive JPEG, high quality | 22 MB | 5.4 s | 325 MB |
| Two of those at once, before uploads were queued | 22 MB each | 10.7 s | 464 MB |
| Two of those at once, queued | 22 MB each | 10.7 s | 330 MB |
| A 25.1 MB file (over the limit) | 25.1 MB | 0.1 s, 413 | 106 MB |

Locally (not in the image), a 48 MP PNG of 137 MB peaked at 253 MB; the byte limit keeps such files out.

## Decision

- **Option 1, sharp in the image.** `build.ts` leaves `sharp` out of the bundle and copies sharp, its three small dependencies and the platform's prebuilt libvips into `dist/node_modules`; the Dockerfile is unchanged apart from its comment, because the build stage is already Alpine and pnpm installs the musl binaries there. sharp is loaded only when photo storage is configured, so a release without storage never touches it, and a failure to load it turns uploads off with an error in the log instead of stopping the API.
- **Limits:** 25 MB per file (a 48 MP phone JPEG fits), 50 megapixels, at least 500 px wide once upright (the Commons rule). The body is capped before it is read, by Content-Length or while it streams. Uploads are received and processed one at a time per process, which is what kept two at once at 330 MB.
- **Output:** upright, sRGB, WebP at 1280 px (hero, quality 82) and 330 px (card, quality 80), no EXIF, XMP or ICC. Keys `courses/<course>/<photo>/hero.webp` and `card.webp`, a new photo id each time, served with `Cache-Control: public, max-age=31536000, immutable`.
- **Formats:** JPEG, PNG and WebP. sharp's prebuilt binaries don't decode HEIC (https://sharp.pixelplumbing.com/install), so the web's file picker asks for `image/jpeg` first: iOS Safari converts a HEIC photo to the first type in `accept` (https://bugs.webkit.org/show_bug.cgi?id=292350). A HEIC file that arrives anyway gets a clear 400 `photo_unsupported`. Not yet tried on a real iPhone.
- **S3 client:** `aws4fetch` (65 KB, no dependencies), only its signer; our own fetch with a 15-second timeout and no retries. The AWS SDK's S3 client is 3.3 MB before its dependencies.
- **Local development without Cloudflare:** VersityGW (`versity/versitygw`, Apache-2.0, published on Docker Hub, release v1.11.0 on 2026-11-10) as an optional docker-compose service. MinIO was not used: its community edition is "distributed as source code only", and its repository was archived on 2026-04-25 as "no longer maintained" (https://github.com/minio/minio). VersityGW checks request signatures, so the integration tests prove the signing, not just the request shape.
- **Schema:** one migration: `photo_source` gains `upload`, and `course_photos.storage_key` (nullable) names a stored copy. `url` stays a full address, so a release without this code, or a rollback, still shows stored photos.
- **Order of operations:** files are written before the row that names them; replaced or removed files are deleted after the row change commits; a failed save deletes the new files; a failed delete is logged with its keys. Changes to one course's photo take turns on the course row's lock (`FOR NO KEY UPDATE`).

## Consequences

- The image grows by about 20 MB, and CI's `docker` job now also starts the image with storage configured and checks sharp converts a JPEG to WebP on musl. The "no node_modules" rule becomes "no node_modules but sharp's".
- Files can be left behind (a crash between writing files and saving the row, or a failed delete). They are never named by a row, so they cost storage, not correctness, and every failed delete is in the log. There is no sweep yet.
- Changing `PHOTO_PUBLIC_URL` after photos are stored needs the stored `url`s rewritten; nothing does that yet.
- `/v1/rankings` keeps its hour-long browser cache, so a new photo can take an hour to reach pages built from it, as before.
- The backfill (`pnpm photos:copy-commons`) is a dry run unless given `--apply`, and refuses a remote database without `--remote`.
