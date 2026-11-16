import { MemberRole } from "@coursebook/domain/curation/types";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { ApiErrorSchema, CoursePageSchema, CourseSchema, PhotoUploadSettingsSchema } from "../contract/schemas";
import { coursePhotos, courses, users } from "../db/schema";
import type { CommonsPhoto } from "../domain/commons";
import { photoKeys, UPLOAD_LIMITS, type UploadLimits } from "../domain/stored-photo";
import { invalidateCatalog } from "../services/catalog";
import { AppError, ErrorCode } from "../services/errors";
import type { PhotoStorage } from "../services/curation";
import { createImageProcessor, type ImageProcessor } from "../services/photo-images";
import { createTestApp } from "../test/app";
import { resetMemberData, testDatabase } from "../test/db";
import { webpChunks } from "../test/image-inspect";
import { createMemoryPhotoStore, MEMORY_PHOTO_URL } from "../test/photo-store";

/**
 * Photos in the app's own storage (issue #67, decision 2026-11-15), through
 * the real app and database with an in-memory bucket: uploads, copies of
 * Commons photos, and the order of writes and deletes that keeps every
 * photo row pointing at files that exist.
 */

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(coursePhotos);
  await resetMemberData(db);
  invalidateCatalog();
});

/** A phone-like JPEG, 800 × 600 stored on its side, with EXIF GPS, XMP and a P3 profile (see photo-images.test.ts). */
const phonePhoto = new Uint8Array(readFileSync(new URL("../test/fixtures/phone-photo-with-gps.jpg", import.meta.url)));

const jpeg = (width: number, height: number, background = "#3a7d44") =>
  sharp({ create: { width, height, channels: 3, background } })
    .jpeg()
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

const commonsPhoto: CommonsPhoto = {
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

/**
 * A curator, Cora, and a member, Max, on an app whose photo storage is an
 * in-memory bucket (or off, with `storage: false`).
 */
async function scenario(options: { storage?: boolean; limits?: UploadLimits; images?: (real: ImageProcessor) => ImageProcessor } = {}) {
  const memory = createMemoryPhotoStore();
  const limits = options.limits ?? UPLOAD_LIMITS;
  const real = createImageProcessor(sharp, limits);
  const photos: PhotoStorage | null = options.storage === false ? null : { store: memory.store, images: options.images?.(real) ?? real, limits };
  const t = createTestApp(db, { photos });
  const curator = t.bearer("user_cora", "cora");
  const member = t.bearer("user_max", "max");
  for (const auth of [curator, member]) expect((await t.get("/v1/me", auth)).status).toBe(200);
  await db.update(users).set({ role: MemberRole.Curator }).where(eq(users.id, "user_cora"));
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, "usa1"));
  if (!row) throw new Error("missing usa1");
  t.setCommonsPhotos([commonsPhoto]);
  t.commonsImages.set(commonsPhoto.url, await jpeg(1280, 853, "#556b2f"));

  /** POST a photo with its form fields; a field set to null is left out. */
  const upload = async (auth: Record<string, string>, fields: { photo?: Uint8Array | null; credit?: string | null; license?: string | null; sourceUrl?: string }, courseId = row.id) => {
    const form = new FormData();
    const photo = fields.photo === undefined ? phonePhoto : fields.photo;
    if (photo) form.set("photo", new File([photo], "IMG_0001.jpg", { type: "image/jpeg" }));
    const credit = fields.credit === undefined ? "Cora Curator" : fields.credit;
    if (credit !== null) form.set("credit", credit);
    const license = fields.license === undefined ? "Used with permission" : fields.license;
    if (license !== null) form.set("license", license);
    if (fields.sourceUrl) form.set("sourceUrl", fields.sourceUrl);
    const response = await t.app.request(`/v1/courses/${courseId}/photo/upload`, { method: "POST", body: form, headers: auth });
    const body: unknown = await response.json();
    return { status: response.status, body };
  };

  const photoRow = async () => (await db.select().from(coursePhotos).where(eq(coursePhotos.courseId, row.id)))[0] ?? null;
  return { t, memory, curator, member, pine: row.id, upload, photoRow };
}

const errorCode = (body: unknown) => ApiErrorSchema.parse(body).error.code;

describe("upload settings", () => {
  it("tells a curator uploads are off until storage is configured", async () => {
    const { t, curator } = await scenario({ storage: false });
    expect(PhotoUploadSettingsSchema.parse((await t.get("/v1/curation/photo-uploads", curator)).body)).toEqual({
      enabled: false,
      maxBytes: 25 * 1024 * 1024,
      maxPixels: 50_000_000,
      minWidth: 500,
      contentTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  });

  it("tells a curator uploads are on with storage", async () => {
    const { t, curator } = await scenario();
    expect(PhotoUploadSettingsSchema.parse((await t.get("/v1/curation/photo-uploads", curator)).body).enabled).toBe(true);
  });

  it("is for curators only", async () => {
    const { t, member } = await scenario();
    const response = await t.get("/v1/curation/photo-uploads", member);
    expect(response.status).toBe(403);
    expect(errorCode(response.body)).toBe("curator_required");
  });
});

describe("uploading a photo", () => {
  it("is refused while storage is off, leaving the course as it was", async () => {
    const { curator, upload, photoRow } = await scenario({ storage: false });
    const response = await upload(curator, {});
    expect(response.status).toBe(503);
    expect(errorCode(response.body)).toBe("photo_uploads_off");
    expect(await photoRow()).toBeNull();
  });

  it("stores the photo upright as WebP at both sizes with no metadata, and shows it with its credit", async () => {
    const { t, memory, curator, member, pine, upload, photoRow } = await scenario();
    const response = await upload(curator, { credit: "  Cora Curator ", license: "CC BY 4.0", sourceUrl: "https://example.com/arcadia" });
    expect(response.status).toBe(200);

    const row = await photoRow();
    expect(row).toMatchObject({ source: "upload", credit: "Cora Curator", license: "CC BY 4.0", width: 600, height: 800, commonsFile: null, setBy: "user_cora" });
    const prefix = row?.storageKey ?? "";
    expect(prefix).toMatch(new RegExp(`^courses/${pine}/[0-9a-f-]{36}$`));
    expect([...memory.objects.keys()].sort()).toEqual(photoKeys(prefix).sort());
    for (const object of memory.objects.values()) {
      expect(object.contentType).toBe("image/webp");
      expect(object.cacheControl).toBe("public, max-age=31536000, immutable");
      expect(webpChunks(object.body)).toEqual(["VP8 "]);
    }

    const photo = {
      url: `${MEMORY_PHOTO_URL}/${prefix}/hero.webp`,
      thumbUrl: `${MEMORY_PHOTO_URL}/${prefix}/card.webp`,
      credit: "Cora Curator",
      license: "CC BY 4.0",
      licenseUrl: null,
      sourceUrl: "https://example.com/arcadia",
    };
    expect(CourseSchema.parse(response.body).photo).toEqual(photo);
    expect(CoursePageSchema.parse((await t.get(`/v1/courses/${pine}`, member)).body).course.photo).toEqual(photo);
  });

  it("names the photo itself as its source when the curator gives none", async () => {
    const { curator, upload } = await scenario();
    const photo = CourseSchema.parse((await upload(curator, {})).body).photo;
    expect(photo?.sourceUrl).toBe(photo?.url);
  });

  it.each([
    { name: "no credit", fields: { credit: null }, status: 400, code: "validation_failed" },
    { name: "a blank credit", fields: { credit: "   " }, status: 400, code: "validation_failed" },
    { name: "no license", fields: { license: null }, status: 400, code: "validation_failed" },
    { name: "no photo", fields: { photo: null }, status: 400, code: "validation_failed" },
    { name: "a source that isn't a URL", fields: { sourceUrl: "my phone" }, status: 400, code: "validation_failed" },
    { name: "a file that isn't an image", fields: { photo: new TextEncoder().encode("GIF89a? no") }, status: 400, code: "photo_unsupported" },
  ])("refuses an upload with $name and stores nothing", async ({ fields, status, code }) => {
    const { memory, curator, upload, photoRow } = await scenario();
    const response = await upload(curator, fields);
    expect(response.status).toBe(status);
    expect(errorCode(response.body)).toBe(code);
    expect(memory.objects.size).toBe(0);
    expect(await photoRow()).toBeNull();
  });

  it("refuses a photo narrower than 500 px", async () => {
    const { curator, upload } = await scenario();
    const response = await upload(curator, { photo: await jpeg(480, 320) });
    expect(response.status).toBe(400);
    expect(errorCode(response.body)).toBe("photo_too_narrow");
  });

  it("refuses a body over the byte limit before reading it", async () => {
    const { curator, upload, memory } = await scenario({ limits: { ...UPLOAD_LIMITS, maxBytes: 4_000 } });
    const response = await upload(curator, { photo: await jpeg(2000, 1500, "#8b4513") });
    expect(response.status).toBe(413);
    expect(ApiErrorSchema.parse(response.body).error).toMatchObject({ code: "photo_too_large", message: expect.stringContaining("0 MB") as unknown });
    expect(memory.objects.size).toBe(0);
  });

  it("refuses a JSON body", async () => {
    const { t, curator, pine } = await scenario();
    const response = await t.send("POST", `/v1/courses/${pine}/photo/upload`, { credit: "x", license: "y" }, curator);
    expect(response.status).toBe(415);
  });

  it("keeps members and visitors out", async () => {
    const { t, memory, member, pine, upload } = await scenario();
    const refused = await upload(member, {});
    expect(refused.status).toBe(403);
    expect(errorCode(refused.body)).toBe("curator_required");
    const anonymous = await t.app.request(`/v1/courses/${pine}/photo/upload`, { method: "POST", body: new FormData() });
    expect(anonymous.status).toBe(401);
    expect(memory.objects.size).toBe(0);
  });

  it("reports an unknown course", async () => {
    const { curator, upload } = await scenario();
    const response = await upload(curator, {}, "00000000-0000-4000-8000-000000000000");
    expect(response.status).toBe(404);
    expect(errorCode(response.body)).toBe("course_not_found");
  });
});

describe("copies of Commons photos", () => {
  it("stores a copy and keeps the Commons credit, license, source page and file name", async () => {
    const { t, memory, curator, pine, photoRow } = await scenario();
    const response = await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: commonsPhoto.file }, curator);
    expect(response.status).toBe(200);
    const row = await photoRow();
    expect(row).toMatchObject({
      source: "commons",
      commonsFile: commonsPhoto.file,
      credit: "Ana",
      license: "CC BY-SA 4.0",
      licenseUrl: commonsPhoto.licenseUrl,
      sourceUrl: commonsPhoto.sourceUrl,
      width: 1280,
      height: 853,
    });
    const prefix = row?.storageKey ?? "";
    expect([...memory.objects.keys()].sort()).toEqual(photoKeys(prefix).sort());
    expect(CourseSchema.parse(response.body).photo).toMatchObject({
      url: `${MEMORY_PHOTO_URL}/${prefix}/hero.webp`,
      thumbUrl: `${MEMORY_PHOTO_URL}/${prefix}/card.webp`,
      sourceUrl: commonsPhoto.sourceUrl,
    });
  });

  it("hotlinks from Commons as before while storage is off", async () => {
    const { t, curator, pine, photoRow } = await scenario({ storage: false });
    expect((await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: commonsPhoto.file }, curator)).status).toBe(200);
    expect(await photoRow()).toMatchObject({ url: commonsPhoto.url, storageKey: null, width: 2000 });
  });

  it("leaves the current photo when Commons won't send the image", async () => {
    const { t, memory, curator, pine, upload, photoRow } = await scenario();
    await upload(curator, {});
    const before = await photoRow();
    t.commonsImages.clear();
    const response = await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: commonsPhoto.file }, curator);
    expect(response.status).toBe(503);
    expect(errorCode(response.body)).toBe("commons_unavailable");
    expect(await photoRow()).toEqual(before);
    expect(memory.objects.size).toBe(2);
  });
});

describe("replacing and removing stored photos", () => {
  it("deletes the replaced photo's files after the new photo is saved", async () => {
    const { t, memory, curator, pine, upload, photoRow } = await scenario();
    await upload(curator, {});
    const first = (await photoRow())?.storageKey ?? "";
    await upload(curator, { photo: await jpeg(1600, 1200) });
    const second = (await photoRow())?.storageKey ?? "";
    expect(second).not.toBe(first);
    expect([...memory.objects.keys()].sort()).toEqual(photoKeys(second).sort());

    expect((await t.send("PUT", `/v1/courses/${pine}/photo`, { commonsFile: commonsPhoto.file }, curator)).status).toBe(200);
    const third = (await photoRow())?.storageKey ?? "";
    expect([...memory.objects.keys()].sort()).toEqual(photoKeys(third).sort());
  });

  it("deletes a removed photo's files after its row is gone", async () => {
    const { t, memory, curator, pine, upload, photoRow } = await scenario();
    await upload(curator, {});
    const removed = await t.send("DELETE", `/v1/courses/${pine}/photo`, undefined, curator);
    expect(removed.status).toBe(200);
    expect(CourseSchema.parse(removed.body).photo).toBeNull();
    expect(await photoRow()).toBeNull();
    expect(memory.objects.size).toBe(0);
  });

  it("logs files it couldn't delete and still makes the change", async () => {
    const { t, memory, curator, upload, photoRow } = await scenario();
    await upload(curator, {});
    const first = (await photoRow())?.storageKey ?? "";
    memory.failDeletes(2);
    const replaced = await upload(curator, { photo: await jpeg(1600, 1200) });
    expect(replaced.status).toBe(200);
    expect((await photoRow())?.storageKey).not.toBe(first);
    expect(t.errors).toEqual([
      expect.objectContaining({ message: "Could not delete a photo's stored files; delete them by hand", detail: expect.objectContaining({ keys: photoKeys(first) }) as unknown }),
    ]);
    expect([...memory.objects.keys()]).toEqual(expect.arrayContaining(photoKeys(first)));
  });

  it("removes every file it wrote when storage fails partway, and keeps the current photo", async () => {
    const { memory, curator, upload, photoRow } = await scenario();
    await upload(curator, {});
    const before = await photoRow();
    const kept = [...memory.objects.keys()];
    // The new photo's hero is stored, then its card is refused.
    let puts = 0;
    const put = memory.store.put.bind(memory.store);
    memory.store.put = (...args) =>
      ++puts === 2 ? Promise.reject(new AppError(503, ErrorCode.PhotoStorageUnavailable, "down")) : put(...args);
    const response = await upload(curator, { photo: await jpeg(1600, 1200) });
    expect(response.status).toBe(503);
    expect(errorCode(response.body)).toBe("photo_storage_unavailable");
    expect(await photoRow()).toEqual(before);
    expect([...memory.objects.keys()].sort()).toEqual(kept.sort());
  });

  it("deletes the files it stored when the photo can't be saved", async () => {
    // The curator loses the role while the photo is being processed, so the save is refused after the files are stored.
    const { memory, curator, upload, photoRow } = await scenario({
      images: (real) => ({
        process: async (input) => {
          const photo = await real.process(input);
          await db.update(users).set({ role: MemberRole.Member }).where(eq(users.id, "user_cora"));
          return photo;
        },
      }),
    });
    const response = await upload(curator, {});
    expect(response.status).toBe(403);
    expect(errorCode(response.body)).toBe("curator_required");
    expect(await photoRow()).toBeNull();
    expect(memory.objects.size).toBe(0);
  });

  it("leaves no stray files when two curators replace a photo at once", async () => {
    const { memory, curator, upload, photoRow } = await scenario();
    const responses = await Promise.all([upload(curator, {}), upload(curator, { photo: await jpeg(1600, 1200) }), upload(curator, { photo: await jpeg(900, 700) })]);
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    const kept = (await photoRow())?.storageKey ?? "";
    expect([...memory.objects.keys()].sort()).toEqual(photoKeys(kept).sort());
  });

  it("warns when a stored photo is removed while storage is off, naming the files left behind", async () => {
    const on = await scenario();
    await on.upload(on.curator, {});
    const prefix = (await on.photoRow())?.storageKey ?? "";
    const off = createTestApp(db, { photos: null });
    const removed = await off.send("DELETE", `/v1/courses/${on.pine}/photo`, undefined, off.bearer("user_cora", "cora"));
    expect(removed.status).toBe(200);
    expect(off.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ detail: expect.objectContaining({ keys: photoKeys(prefix) }) as unknown })]));
  });
});
