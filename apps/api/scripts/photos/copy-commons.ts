import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../../src/db/client";
import { coursePhotos, courses } from "../../src/db/schema";
import { PhotoSource } from "../../src/domain/course-photo";
import type { CommonsClient } from "../../src/services/commons";
import { deleteFiles, storeFiles, type LeftoverLog, type PhotoStorage } from "../../src/services/curation";

/**
 * Copy the Commons photos chosen before photo storage existed into it
 * (issue #67), so every photo is served from the app's own bucket. Each
 * row keeps its credit, license, source page and Commons file name; only
 * where it is served from (`url`, `storage_key`) and the served size change.
 *
 * Safe to run twice: only Commons rows without a stored copy are copied.
 * A row is updated only if it still names the image that was copied, so a
 * curator's change during the run is never overwritten; the copy is then
 * deleted. Files are written before the row names them, as in the API.
 */

/** A Commons photo still served from Commons. */
export interface PhotoToCopy {
  courseId: string;
  courseName: string;
  /** The Commons address it is served from today: the 1280 px thumbnail, or the original when narrower. */
  url: string;
  commonsFile: string | null;
}

/** What happened to one photo. */
export enum CopyResult {
  Copied = "copied",
  /** The row changed while its photo was copied, so the copy was dropped. */
  Changed = "changed",
  Failed = "failed",
}

export interface CopyOutcome {
  photo: PhotoToCopy;
  result: CopyResult;
  /** Why it failed, for the operator. */
  reason?: string;
}

/** Commons photos without a stored copy, by course name. */
export async function photosToCopy(db: Database): Promise<PhotoToCopy[]> {
  return db
    .select({ courseId: coursePhotos.courseId, courseName: courses.name, url: coursePhotos.url, commonsFile: coursePhotos.commonsFile })
    .from(coursePhotos)
    .innerJoin(courses, eq(courses.id, coursePhotos.courseId))
    .where(and(eq(coursePhotos.source, PhotoSource.Commons), isNull(coursePhotos.storageKey)))
    .orderBy(courses.name);
}

/** What copying needs: Commons for the image, and photo storage. */
export interface CopyDependencies {
  commons: Pick<CommonsClient, "image">;
  storage: PhotoStorage;
  log: LeftoverLog;
}

/**
 * Copy one photo into storage and point its row at the copy.
 *
 * Never throws; a failure is the outcome's `reason`.
 */
export async function copyCommonsPhoto(db: Database, deps: CopyDependencies, photo: PhotoToCopy): Promise<CopyOutcome> {
  let stored: Awaited<ReturnType<typeof storeFiles>>;
  try {
    const image = await deps.commons.image(photo.url);
    stored = await storeFiles(deps.storage.store, photo.courseId, await deps.storage.images.process(image), deps.log);
  } catch (error) {
    return { photo, result: CopyResult.Failed, reason: error instanceof Error ? error.message : String(error) };
  }
  let updated: { courseId: string }[];
  try {
    updated = await db
      .update(coursePhotos)
      .set({ url: stored.url, width: stored.width, height: stored.height, storageKey: stored.prefix, updatedAt: sql`now()` })
      .where(and(eq(coursePhotos.courseId, photo.courseId), eq(coursePhotos.url, photo.url), isNull(coursePhotos.storageKey)))
      .returning({ courseId: coursePhotos.courseId });
  } catch (error) {
    await deleteFiles(deps.storage.store, stored.prefix, deps.log);
    return { photo, result: CopyResult.Failed, reason: error instanceof Error ? error.message : String(error) };
  }
  if (updated.length === 1) return { photo, result: CopyResult.Copied };
  await deleteFiles(deps.storage.store, stored.prefix, deps.log);
  return { photo, result: CopyResult.Changed };
}

/**
 * Copy every Commons photo without a stored copy, one after another.
 *
 * Args:
 *     db: The database whose rows are updated.
 *     deps: Commons, photo storage and the leftover-file log.
 *     pauseMs: Wait between downloads, to go easy on Wikimedia's servers.
 *     onOutcome: Told each photo's outcome as it happens.
 *
 * Returns:
 *     Every photo's outcome, in course name order.
 */
export async function copyCommonsPhotos(
  db: Database,
  deps: CopyDependencies,
  { pauseMs, onOutcome }: { pauseMs: number; onOutcome?: (outcome: CopyOutcome) => void },
): Promise<CopyOutcome[]> {
  const outcomes: CopyOutcome[] = [];
  for (const [index, photo] of (await photosToCopy(db)).entries()) {
    if (index > 0 && pauseMs > 0) await new Promise((resolve) => setTimeout(resolve, pauseMs));
    const outcome = await copyCommonsPhoto(db, deps, photo);
    outcomes.push(outcome);
    onOutcome?.(outcome);
  }
  return outcomes;
}
