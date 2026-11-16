import { eq } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { coursePhotos, courses } from "../../src/db/schema";
import { PhotoSource } from "../../src/domain/course-photo";
import { photoKeys, UPLOAD_LIMITS } from "../../src/domain/stored-photo";
import { AppError, ErrorCode } from "../../src/services/errors";
import type { LeftoverLog } from "../../src/services/curation";
import { createImageProcessor } from "../../src/services/photo-images";
import { resetMemberData, testDatabase } from "../../src/test/db";
import { createMemoryPhotoStore, MEMORY_PHOTO_URL } from "../../src/test/photo-store";
import { copyCommonsPhoto, copyCommonsPhotos, CopyResult, photosToCopy } from "./copy-commons";

/** The backfill of Commons photos into photo storage (#67), against the test database and an in-memory bucket. */

const { db, pool } = testDatabase();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await db.delete(coursePhotos);
  await resetMemberData(db);
});

const courseId = async (stableId: string) => {
  const [row] = await db.select({ id: courses.id }).from(courses).where(eq(courses.stableId, stableId));
  if (!row) throw new Error("missing " + stableId);
  return row.id;
};

const commonsUrl = (name: string) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}.jpg/1280px-${name}.jpg`;

/** A Commons photo row as the first release saved it: served from Commons, no stored copy. */
const hotlinked = (id: string, name: string) => ({
  courseId: id,
  source: PhotoSource.Commons,
  url: commonsUrl(name),
  width: 3000,
  height: 2000,
  credit: "Ana",
  license: "CC BY-SA 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  sourceUrl: `https://commons.wikimedia.org/wiki/File:${name}.jpg`,
  commonsFile: `File:${name}.jpg`,
});

async function setup() {
  const [pine, augusta, cypress] = [await courseId("usa1"), await courseId("usa2"), await courseId("usa3")];
  await db.insert(coursePhotos).values([hotlinked(pine, "Pine"), hotlinked(augusta, "Augusta")]);
  // Already copied: a later run must leave it alone.
  await db.insert(coursePhotos).values({ ...hotlinked(cypress, "Cypress"), url: `${MEMORY_PHOTO_URL}/courses/${cypress}/x/hero.webp`, storageKey: `courses/${cypress}/x` });
  const memory = createMemoryPhotoStore();
  const images = new Map<string, Uint8Array>();
  for (const name of ["Pine", "Augusta"])
    images.set(commonsUrl(name), new Uint8Array(await sharp({ create: { width: 1280, height: 853, channels: 3, background: "#2f5d3a" } }).jpeg().toBuffer()));
  const downloads: string[] = [];
  const leftovers: string[][] = [];
  const log: LeftoverLog = (_message, detail) => leftovers.push(detail.keys);
  const deps = {
    commons: {
      image: (url: string) => {
        downloads.push(url);
        const bytes = images.get(url);
        return bytes ? Promise.resolve(bytes) : Promise.reject(new AppError(503, ErrorCode.CommonsUnavailable, "Commons isn't answering"));
      },
    },
    storage: { store: memory.store, images: createImageProcessor(sharp, UPLOAD_LIMITS), limits: UPLOAD_LIMITS },
    log,
  };
  const row = async (id: string) => (await db.select().from(coursePhotos).where(eq(coursePhotos.courseId, id)))[0];
  return { pine, augusta, cypress, memory, images, downloads, leftovers, deps, row };
}

describe("copying Commons photos into photo storage", () => {
  it("lists only Commons photos without a stored copy", async () => {
    const { pine, augusta } = await setup();
    expect((await photosToCopy(db)).map((photo) => photo.courseId).sort()).toEqual([pine, augusta].sort());
  });

  it("copies each one, keeping its credit, license, source page and file name", async () => {
    const { pine, augusta, memory, row, deps } = await setup();
    const before = await row(pine);
    const outcomes = await copyCommonsPhotos(db, deps, { pauseMs: 0 });
    expect(outcomes.map((outcome) => outcome.result)).toEqual([CopyResult.Copied, CopyResult.Copied]);
    for (const id of [pine, augusta]) {
      const copied = await row(id);
      const prefix = copied?.storageKey ?? "";
      expect(prefix).toMatch(new RegExp(`^courses/${id}/`));
      expect(copied).toMatchObject({ url: `${MEMORY_PHOTO_URL}/${prefix}/hero.webp`, width: 1280, height: 853, source: "commons" });
      expect([...memory.objects.keys()]).toEqual(expect.arrayContaining(photoKeys(prefix)));
    }
    const after = await row(pine);
    expect(after && { credit: after.credit, license: after.license, licenseUrl: after.licenseUrl, sourceUrl: after.sourceUrl, commonsFile: after.commonsFile }).toEqual(
      before && { credit: before.credit, license: before.license, licenseUrl: before.licenseUrl, sourceUrl: before.sourceUrl, commonsFile: before.commonsFile },
    );
  });

  it("does nothing the second time", async () => {
    const { memory, downloads, deps } = await setup();
    await copyCommonsPhotos(db, deps, { pauseMs: 0 });
    const stored = memory.objects.size;
    expect(await copyCommonsPhotos(db, deps, { pauseMs: 0 })).toEqual([]);
    expect(memory.objects.size).toBe(stored);
    expect(downloads).toHaveLength(2);
  });

  it("drops the copy when a curator changed the photo meanwhile", async () => {
    const { pine, memory, row, deps } = await setup();
    const [photo] = (await photosToCopy(db)).filter((entry) => entry.courseId === pine);
    if (!photo) throw new Error("missing");
    await db.update(coursePhotos).set({ url: commonsUrl("Other"), commonsFile: "File:Other.jpg" }).where(eq(coursePhotos.courseId, pine));
    expect((await copyCommonsPhoto(db, deps, photo)).result).toBe(CopyResult.Changed);
    expect(await row(pine)).toMatchObject({ url: commonsUrl("Other"), storageKey: null });
    expect(memory.objects.size).toBe(0);
  });

  it("reports a failed download and carries on with the rest", async () => {
    const { pine, augusta, images, row, deps } = await setup();
    images.delete(commonsUrl("Augusta"));
    const outcomes = await copyCommonsPhotos(db, deps, { pauseMs: 0 });
    expect(outcomes.map((outcome) => [outcome.photo.courseId, outcome.result])).toEqual(
      expect.arrayContaining([
        [pine, CopyResult.Copied],
        [augusta, CopyResult.Failed],
      ]),
    );
    expect(outcomes.find((outcome) => outcome.result === CopyResult.Failed)?.reason).toBe("Commons isn't answering");
    expect((await row(augusta))?.storageKey).toBeNull();
  });
});
