import type { Course } from "@coursebook/domain/catalog/course";
import { canCurate, MemberRole, type CommonsCandidate, type CurationCourse, type RoledMember } from "@coursebook/domain/curation/types";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { Database, Executor } from "../db/client";
import { coursePhotos, userCourses, users } from "../db/schema";
import { PhotoSource } from "../domain/course-photo";
import { toPublicMember } from "./authz";
import { invalidateCatalog } from "./catalog";
import type { CommonsClient } from "./commons";
import { AppError, ErrorCode } from "./errors";
import { courseViews } from "./timeline";

/**
 * Course photo curation (decision 2026-11-13): curators set and remove
 * course photos from Wikimedia Commons; admins make members curators.
 * Every operation checks the acting member's role in the database on each
 * request, so a revoked role stops working at once.
 */

/** The member's role; a member who no longer exists has none to use. */
export async function memberRole(db: Executor, userId: string): Promise<MemberRole> {
  const [row] = await db
    .select({ role: users.role })
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt)));
  return row?.role ?? MemberRole.Member;
}

async function requireCurator(db: Executor, userId: string): Promise<void> {
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

/**
 * Make a Commons file a course's photo, replacing any it had. The file's
 * credit and license come from Commons, never from the request.
 *
 * Raises:
 *     AppError: 403 `curator_required`; 404 `course_not_found`; 400
 *         `photo_not_usable` when Commons has no usable photo by that name;
 *         503 `commons_unavailable`.
 */
export async function setCommonsPhoto(db: Database, commons: CommonsClient, userId: string, courseId: string, file: string): Promise<Course> {
  await requireCurator(db, userId);
  await courseOrThrow(db, courseId);
  const photo = await commons.file(file);
  if (!photo)
    throw new AppError(400, ErrorCode.PhotoNotUsable, "That Commons file can't be used: it's missing, not a photo, too small, or not under a free license.");
  const values = {
    source: PhotoSource.Commons,
    url: photo.url,
    width: photo.width,
    height: photo.height,
    credit: photo.credit,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
    commonsFile: photo.file,
    setBy: userId,
  };
  const course = await db.transaction(async (tx) => {
    await requireCurator(tx, userId);
    await tx
      .insert(coursePhotos)
      .values({ courseId, ...values })
      .onConflictDoUpdate({ target: coursePhotos.courseId, set: { ...values, updatedAt: sql`now()` } });
    return courseOrThrow(tx, courseId);
  });
  invalidateCatalog();
  return course;
}

/** Remove a course's photo, if it has one. */
export async function removeCoursePhoto(db: Database, userId: string, courseId: string): Promise<Course> {
  const course = await db.transaction(async (tx) => {
    await requireCurator(tx, userId);
    await courseOrThrow(tx, courseId);
    await tx.delete(coursePhotos).where(eq(coursePhotos.courseId, courseId));
    return courseOrThrow(tx, courseId);
  });
  invalidateCatalog();
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
