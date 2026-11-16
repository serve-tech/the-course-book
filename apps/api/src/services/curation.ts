import type { Course } from "@coursebook/domain/catalog/course";
import { canCurate, MemberRole, type CommonsCandidate, type CurationCourse, type RoledMember } from "@coursebook/domain/curation/types";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database, Executor, Transaction } from "../db/client";
import { coursePhotos, courses, userCourses, users } from "../db/schema";
import { PhotoSource } from "../domain/course-photo";
import { photoKey, photoKeys, photoPrefix, PhotoSize, STORED_PHOTO_CACHE_CONTROL, STORED_PHOTO_TYPE, type UploadLimits } from "../domain/stored-photo";
import { toPublicMember } from "./authz";
import { invalidateCatalog } from "./catalog";
import type { CommonsClient } from "./commons";
import { AppError, ErrorCode } from "./errors";
import type { ImageProcessor, ProcessedPhoto } from "./photo-images";
import type { PhotoStore } from "./photo-store";
import { courseViews } from "./timeline";

/**
 * Course photo curation (decision 2026-11-13): curators upload course
 * photos or pick them from Wikimedia Commons, and remove them; admins make
 * members curators. Every operation checks the acting member's role in the
 * database on each request, so a revoked role stops working at once.
 *
 * Stored photos (issue #67, decision 2026-11-15) follow one rule so a row
 * never names a missing file: files are written before the row that names
 * them, and deleted only after the row that named them is gone. A crash or
 * a failed delete can leave unnamed files in the bucket, never a broken
 * photo; each one left behind is logged with its keys.
 */

/** What the API needs to keep photos in its own storage; null when photo storage is off. */
export interface PhotoStorage {
  store: PhotoStore;
  images: ImageProcessor;
  limits: UploadLimits;
}

/**
 * Reports stored files left behind (a delete failed, or storage was turned
 * off while a stored photo was removed), so they can be removed by hand.
 * `error` is the failure, absent when nothing failed.
 */
export type LeftoverLog = (message: string, detail: { keys: string[] }, error?: unknown) => void;

/** The member's role; a member who no longer exists has none to use. */
export async function memberRole(db: Executor, userId: string): Promise<MemberRole> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  return row?.role ?? MemberRole.Member;
}

/**
 * Refuse a member who may not curate.
 *
 * Raises:
 *     AppError: 403 `curator_required`.
 */
export async function requireCurator(db: Executor, userId: string): Promise<void> {
  if (!canCurate(await memberRole(db, userId))) throw new AppError(403, ErrorCode.CuratorRequired, "Only curators can change course photos.");
}

async function requireAdmin(db: Executor, userId: string): Promise<void> {
  if ((await memberRole(db, userId)) !== MemberRole.Admin) throw new AppError(403, ErrorCode.AdminRequired, "Only admins can change who curates.");
}

async function courseOrThrow(db: Executor, courseId: string): Promise<Course> {
  const course = (await courseViews(db, [courseId])).get(courseId);
  if (!course) throw new AppError(404, ErrorCode.CourseNotFound, "There is no course with that id.");
  return course;
}

/**
 * Every course on an active member's ranking, with how many members rank
 * it, most-ranked first and then by name: where photos matter most.
 */
export async function curationCourses(db: Database, userId: string): Promise<CurationCourse[]> {
  await requireCurator(db, userId);
  const rows = await db
    .select({ courseId: userCourses.courseId, members: count() })
    .from(userCourses)
    .innerJoin(users, eq(users.id, userCourses.userId))
    .where(isNull(users.deletedAt))
    .groupBy(userCourses.courseId);
  const views = await courseViews(
    db,
    rows.map((row) => row.courseId),
  );
  return rows
    .flatMap((row) => {
      const course = views.get(row.courseId);
      return course ? [{ course, members: row.members }] : [];
    })
    .sort((a, b) => b.members - a.members || a.course.name.localeCompare(b.course.name));
}

/** Usable Commons photos matching `query`, for a curator. */
export async function searchCommons(db: Database, commons: CommonsClient, userId: string, query: string): Promise<CommonsCandidate[]> {
  await requireCurator(db, userId);
  return commons.search(query);
}

/** The columns a photo change writes; `courseId` and the timestamps are added by the write. */
type PhotoValues = Omit<typeof coursePhotos.$inferInsert, "courseId" | "createdAt" | "updatedAt">;

/** A stored copy's prefix and the hero file's address and size. */
export interface StoredFiles {
  prefix: string;
  url: string;
  width: number;
  height: number;
}

/**
 * Delete a stored photo's files. Never throws: the row no longer names
 * them, so a failure only leaves unused files, which is logged.
 */
export async function deleteFiles(store: PhotoStore | null, prefix: string, log: LeftoverLog): Promise<void> {
  const keys = photoKeys(prefix);
  if (!store) {
    log("Photo storage is off, so a removed photo's files were left in the bucket", { keys });
    return;
  }
  const failed: string[] = [];
  let failure: unknown;
  for (const key of keys) {
    try {
      await store.delete(key);
    } catch (error) {
      failed.push(key);
      failure = error;
    }
  }
  if (failed.length) log("Could not delete a photo's stored files; delete them by hand", { keys: failed }, failure);
}

/**
 * Write a processed photo's files under a new prefix, hero first. If a
 * write fails, the files already written are deleted before the error is
 * passed on.
 */
export async function storeFiles(store: PhotoStore, courseId: string, photo: ProcessedPhoto, log: LeftoverLog): Promise<StoredFiles> {
  const prefix = photoPrefix(courseId, randomUUID());
  try {
    for (const size of Object.values(PhotoSize)) await store.put(photoKey(prefix, size), photo[size].bytes, STORED_PHOTO_TYPE, STORED_PHOTO_CACHE_CONTROL);
  } catch (error) {
    await deleteFiles(store, prefix, log);
    throw error;
  }
  const hero = photo[PhotoSize.Hero];
  return { prefix, url: store.publicUrl(photoKey(prefix, PhotoSize.Hero)), width: hero.width, height: hero.height };
}

/** Lock the course's row against other photo changes until the transaction ends; 404 when there is no such course. */
async function lockCourse(tx: Transaction, courseId: string): Promise<void> {
  const [row] = await tx.select({ id: courses.id }).from(courses).where(eq(courses.id, courseId)).for("no key update");
  if (!row) throw new AppError(404, ErrorCode.CourseNotFound, "There is no course with that id.");
}

/**
 * Make `values` the course's photo, then delete the files of the photo it
 * replaces.
 *
 * Concurrent changes to one course take turns on the course row's lock, so
 * each sees the photo the one before it wrote and deletes that one's files.
 * If the write fails, the new files (named by `values.storageKey`) are
 * deleted, since nothing names them.
 */
async function writePhoto(db: Database, store: PhotoStore | null, log: LeftoverLog, userId: string, courseId: string, values: PhotoValues): Promise<Course> {
  let written: { course: Course; replaced: string | null };
  try {
    written = await db.transaction(async (tx) => {
      await requireCurator(tx, userId);
      await lockCourse(tx, courseId);
      const [previous] = await tx.select({ storageKey: coursePhotos.storageKey }).from(coursePhotos).where(eq(coursePhotos.courseId, courseId));
      await tx
        .insert(coursePhotos)
        .values({ courseId, ...values })
        .onConflictDoUpdate({ target: coursePhotos.courseId, set: { ...values, updatedAt: sql`now()` } });
      return { course: await courseOrThrow(tx, courseId), replaced: previous?.storageKey ?? null };
    });
  } catch (error) {
    if (values.storageKey) await deleteFiles(store, values.storageKey, log);
    throw error;
  }
  invalidateCatalog();
  if (written.replaced && written.replaced !== values.storageKey) await deleteFiles(store, written.replaced, log);
  return written.course;
}

/**
 * Make a Commons file a course's photo, replacing any it had. The file's
 * credit and license come from Commons, never from the request. With photo
 * storage on, the photo is copied into it and served from there, keeping
 * the Commons credit, license, source page and file name.
 *
 * Raises:
 *     AppError: 403 `curator_required`; 404 `course_not_found`; 400
 *         `photo_not_usable` when Commons has no usable photo by that name;
 *         503 `commons_unavailable` or `photo_storage_unavailable`.
 */
export async function setCommonsPhoto(
  db: Database,
  commons: CommonsClient,
  storage: PhotoStorage | null,
  log: LeftoverLog,
  userId: string,
  courseId: string,
  file: string,
): Promise<Course> {
  await requireCurator(db, userId);
  await courseOrThrow(db, courseId);
  const photo = await commons.file(file);
  if (!photo)
    throw new AppError(400, ErrorCode.PhotoNotUsable, "That Commons file can't be used: it's missing, not a photo, too small, or not under a free license.");
  const stored = storage ? await storeFiles(storage.store, courseId, await storage.images.process(await commons.image(photo.url)), log) : null;
  return writePhoto(db, storage?.store ?? null, log, userId, courseId, {
    source: PhotoSource.Commons,
    url: stored?.url ?? photo.url,
    width: stored?.width ?? photo.width,
    height: stored?.height ?? photo.height,
    credit: photo.credit,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
    commonsFile: photo.file,
    storageKey: stored?.prefix ?? null,
    setBy: userId,
  });
}

/** A curator's upload: the image and the credit and license or permission it is shown with. */
export interface PhotoUpload {
  /** The image file as sent, at most the upload limit's bytes. */
  image: Uint8Array;
  credit: string;
  /** A license's short name (`CC BY 4.0`) or the permission given (`Used with permission`). */
  license: string;
  licenseUrl: string | null;
  /** Where the photo came from; null when the curator took it or has no page to point to. */
  sourceUrl: string | null;
}

/**
 * Make an uploaded photo a course's photo, replacing any it had. The image
 * is stored upright as WebP at the hero and card widths, with its metadata
 * (location included) removed. A photo with no source page names its own
 * hero file as the source, because every photo carries one.
 *
 * Raises:
 *     AppError: 503 `photo_uploads_off` without photo storage; 403
 *         `curator_required`; 404 `course_not_found`; 400
 *         `photo_unsupported` or `photo_too_narrow`; 413 `photo_too_large`;
 *         503 `photo_storage_unavailable`.
 */
export async function uploadCoursePhoto(
  db: Database,
  storage: PhotoStorage | null,
  log: LeftoverLog,
  userId: string,
  courseId: string,
  upload: PhotoUpload,
): Promise<Course> {
  if (!storage) throw new AppError(503, ErrorCode.PhotoUploadsOff, "Photo uploads aren't switched on yet. Pick a photo from Wikimedia Commons instead.");
  await requireCurator(db, userId);
  await courseOrThrow(db, courseId);
  const stored = await storeFiles(storage.store, courseId, await storage.images.process(upload.image), log);
  return writePhoto(db, storage.store, log, userId, courseId, {
    source: PhotoSource.Upload,
    url: stored.url,
    width: stored.width,
    height: stored.height,
    credit: upload.credit,
    license: upload.license,
    licenseUrl: upload.licenseUrl,
    sourceUrl: upload.sourceUrl ?? stored.url,
    commonsFile: null,
    storageKey: stored.prefix,
    setBy: userId,
  });
}

/** Remove a course's photo, if it has one, then delete its stored files. */
export async function removeCoursePhoto(db: Database, store: PhotoStore | null, log: LeftoverLog, userId: string, courseId: string): Promise<Course> {
  const { course, removed } = await db.transaction(async (tx) => {
    await requireCurator(tx, userId);
    await lockCourse(tx, courseId);
    const [row] = await tx.delete(coursePhotos).where(eq(coursePhotos.courseId, courseId)).returning({ storageKey: coursePhotos.storageKey });
    return { course: await courseOrThrow(tx, courseId), removed: row?.storageKey ?? null };
  });
  invalidateCatalog();
  if (removed) await deleteFiles(store, removed, log);
  return course;
}

const ROLE_ORDER: Record<MemberRole, number> = { [MemberRole.Admin]: 0, [MemberRole.Curator]: 1, [MemberRole.Member]: 2 };

/** Every active member with their role, admins and curators first, for an admin. */
export async function memberRoles(db: Database, userId: string): Promise<RoledMember[]> {
  await requireAdmin(db, userId);
  const rows = await db
    .select({ username: users.username, displayName: users.displayName, role: users.role })
    .from(users)
    .where(isNull(users.deletedAt));
  return rows
    .map((row) => ({ member: toPublicMember(row), role: row.role }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.member.displayName.localeCompare(b.member.displayName));
}

/**
 * Make a member a curator, or a member again. Admins are made by command
 * (`pnpm role:set`), so this never creates or changes one.
 *
 * Raises:
 *     AppError: 403 `admin_required`; 404 `member_not_found`; 409
 *         `role_protected` when the member is an admin.
 */
export async function setMemberRole(db: Database, userId: string, username: string, role: MemberRole.Member | MemberRole.Curator): Promise<RoledMember> {
  return db.transaction(async (tx) => {
    await requireAdmin(tx, userId);
    const [target] = await tx
      .select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role })
      .from(users)
      .where(and(sql`lower(${users.username}) = lower(${username})`, isNull(users.deletedAt)));
    if (!target) throw new AppError(404, ErrorCode.MemberNotFound, "There is no member with that username.");
    if (target.role === MemberRole.Admin) throw new AppError(409, ErrorCode.RoleProtected, "An admin's role can only be changed by command.");
    await tx.update(users).set({ role, updatedAt: sql`now()` }).where(eq(users.id, target.id));
    return { member: toPublicMember(target), role };
  });
}
