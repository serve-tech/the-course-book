import { MemberRole } from "@coursebook/domain/curation/types";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CommonsCandidatesSchema,
  CoursePageSchema,
  CourseSchema,
  CurationCoursesSchema,
  MeSchema,
  MyCoursesSchema,
  RoledMemberSchema,
  RoledMembersSchema,
} from "../contract/schemas";
import { courses, userCourses, users } from "../db/schema";
import type { CommonsPhoto } from "../domain/commons";
import { invalidateCatalog } from "../services/catalog";
import { AppError, ErrorCode } from "../services/errors";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";

/** Course photo curation and the curator role (decision 2026-11-13), through the real app. */

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await resetMemberData(db);
  invalidateCatalog();
});

const seeded = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

const arcadiaPhoto: CommonsPhoto = {
  file: "File:Pine Valley 18th.jpg",
  url: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine_Valley_18th.jpg/1280px-Pine_Valley_18th.jpg",
  thumbUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Pine_Valley_18th.jpg/330px-Pine_Valley_18th.jpg",
  width: 2000,
  height: 1333,
  credit: "Ana",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: "https://commons.wikimedia.org/wiki/File:Pine_Valley_18th.jpg",
  description: "The 18th green at Pine Valley",
};

/** golfer_1 (an admin), curator Cora, member Max; Max ranks Pine Valley and Augusta, Cora ranks Pine Valley. */
async function scenario() {
  const t = createTestApp(db);
  const admin = t.bearer("user_1", "golfer_1");
  const curator = t.bearer("user_cora", "cora");
  const member = t.bearer("user_max", "max");
  for (const auth of [admin, curator, member]) expect((await t.get("/v1/me", auth)).status).toBe(200);
  await db.update(users).set({ role: MemberRole.Admin }).where(eq(users.id, "user_1"));
  await db.update(users).set({ role: MemberRole.Curator }).where(eq(users.id, "user_cora"));
  const [pine, augusta] = [await seeded("usa1"), await seeded("usa2")];
  await db.insert(userCourses).values([
    { userId: "user_max", courseId: pine, personalRank: 1 },
    { userId: "user_max", courseId: augusta, personalRank: 2 },
    { userId: "user_cora", courseId: pine, personalRank: 1 },
  ]);
  t.setCommonsPhotos([arcadiaPhoto]);
  return { t, admin, curator, member, pine, augusta };
}

describe("roles", () => {
  it("reports each member's role on /v1/me", async () => {
    const { t, admin, curator, member } = await scenario();
    expect(MeSchema.parse((await t.get("/v1/me", admin)).body).role).toBe("admin");
    expect(MeSchema.parse((await t.get("/v1/me", curator)).body).role).toBe("curator");
    expect(MeSchema.parse((await t.get("/v1/me", member)).body).role).toBe("member");
  });

  it("keeps members out of every curation operation", async () => {
    const { t, member, pine } = await scenario();
    const responses = [
      await t.get("/v1/curation/courses", member),
      await t.get("/v1/curation/commons-photos?q=pine", member),
      await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: arcadiaPhoto.file }, member),
      await t.send("DELETE", `/v1/courses/${pine}/photo`, undefined, member),
    ];
    for (const response of responses) {
      expect(response.status).toBe(403);
      expect(ApiErrorSchema.parse(response.body).error.code).toBe("curator_required");
    }
  });
});

describe("photo curation", () => {
  it("lists courses on members' rankings, most-ranked first", async () => {
    const { t, curator, pine, augusta } = await scenario();
    const { courses: listed } = CurationCoursesSchema.parse((await t.get("/v1/curation/courses", curator)).body);
    expect(listed.map((entry) => [entry.course.id, entry.members])).toEqual([
      [pine, 2],
      [augusta, 1],
    ]);
    expect(listed[0]?.course.photo).toBeNull();
  });

  it("searches Commons for a curator", async () => {
    const { t, curator } = await scenario();
    const { candidates } = CommonsCandidatesSchema.parse((await t.get("/v1/curation/commons-photos?q=pine", curator)).body);
    expect(candidates.map((candidate) => candidate.file)).toEqual([arcadiaPhoto.file]);
    expect(candidates[0]).not.toHaveProperty("url");
  });

  it("sets a photo with Commons' credit and license, shows it everywhere, and removes it", async () => {
    const { t, curator, member, pine } = await scenario();
    const set = await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: arcadiaPhoto.file }, curator);
    expect(set.status).toBe(200);
    const photo = {
      url: arcadiaPhoto.url,
      credit: "Ana",
      license: "CC BY-SA 4.0",
      licenseUrl: arcadiaPhoto.licenseUrl,
      sourceUrl: arcadiaPhoto.sourceUrl,
    };
    expect(CourseSchema.parse(set.body).photo).toEqual(photo);
    expect(CoursePageSchema.parse((await t.get(`/v1/courses/${pine}`, member)).body).course.photo).toEqual(photo);
    const mine = MyCoursesSchema.parse((await t.get("/v1/me/courses", member)).body);
    expect(mine.courses.find((entry) => entry.course.id === pine)?.course.photo).toEqual(photo);

    const removed = await t.send("DELETE", `/v1/courses/${pine}/photo`, undefined, curator);
    expect(removed.status).toBe(200);
    expect(CourseSchema.parse(removed.body).photo).toBeNull();
    expect(CoursePageSchema.parse((await t.get(`/v1/courses/${pine}`, member)).body).course.photo).toBeNull();
  });

  it.each([
    { name: "a file Commons can't use", body: { commonsFile: "File:Logo.svg" }, status: 400, code: "photo_not_usable" },
    { name: "something other than a file title", body: { commonsFile: "https://example.com/a.jpg" }, status: 400, code: "validation_failed" },
  ])("rejects $name", async ({ body, status, code }) => {
    const { t, curator, pine } = await scenario();
    const response = await t.send("PUT", `/v1/courses/${pine}/photo`, body, curator);
    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe(code);
  });

  it("reports an unknown course before asking Commons", async () => {
    const { t, curator } = await scenario();
    t.setCommonsPhotos(new Error("Commons must not be asked"));
    const response = await t.send("PUT", "/v1/courses/00000000-0000-4000-8000-000000000000/photo", { commonsFile: arcadiaPhoto.file }, curator);
    expect(response.status).toBe(404);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe("course_not_found");
  });

  it("passes on Commons being unavailable", async () => {
    const { t, curator } = await scenario();
    t.setCommonsPhotos(new AppError(503, ErrorCode.CommonsUnavailable, "down"));
    const response = await t.get("/v1/curation/commons-photos?q=pine", curator);
    expect(response.status).toBe(503);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe("commons_unavailable");
  });
});

describe("curator role", () => {
  it("lets an admin list members and make one a curator, and back", async () => {
    const { t, admin, member } = await scenario();
    const { members } = RoledMembersSchema.parse((await t.get("/v1/admin/members", admin)).body);
    expect(members.map((entry) => [entry.member.username, entry.role])).toEqual([
      ["golfer_1", "admin"],
      ["cora", "curator"],
      ["max", "member"],
    ]);
    const granted = await t.send("PUT", "/v1/admin/members/MAX/role", { role: "curator" }, admin);
    expect(RoledMemberSchema.parse(granted.body)).toEqual({ member: { username: "max", displayName: "max Name" }, role: "curator" });
    expect((await t.get("/v1/curation/courses", member)).status).toBe(200);
    await t.send("PUT", "/v1/admin/members/max/role", { role: "member" }, admin);
    expect((await t.get("/v1/curation/courses", member)).status).toBe(403);
  });

  it.each([
    { name: "a curator", who: "curator" as const, path: "/v1/admin/members/max/role", body: { role: "curator" }, status: 403, code: "admin_required" },
    { name: "an admin's own role", who: "admin" as const, path: "/v1/admin/members/golfer_1/role", body: { role: "member" }, status: 409, code: "role_protected" },
    { name: "making an admin", who: "admin" as const, path: "/v1/admin/members/max/role", body: { role: "admin" }, status: 400, code: "validation_failed" },
    { name: "an unknown member", who: "admin" as const, path: "/v1/admin/members/nobody/role", body: { role: "curator" }, status: 404, code: "member_not_found" },
  ])("refuses $name", async ({ who, path, body, status, code }) => {
    const context = await scenario();
    const response = await context.t.send("PUT", path, body, context[who]);
    expect(response.status).toBe(status);
    expect(ApiErrorSchema.parse(response.body).error.code).toBe(code);
  });

  it("keeps the member list from curators", async () => {
    const { t, curator } = await scenario();
    expect((await t.get("/v1/admin/members", curator)).status).toBe(403);
  });
});
