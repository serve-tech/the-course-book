import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { PhotoSize, UPLOAD_LIMITS, type UploadLimits } from "../domain/stored-photo";
import { jpegGpsLatitude, jpegSegments, webpChunks } from "../test/image-inspect";
import { ErrorCode } from "./errors";
import { createImageProcessor, loadImageProcessor } from "./photo-images";

/**
 * The fixture is a small phone-like JPEG made with sharp for these tests:
 * 800 × 600 pixels stored on its side (EXIF orientation 6, so it shows as
 * 600 × 800), a red bar along the left edge as stored, EXIF camera details
 * and a GPS location, an XMP packet repeating the location, and a Display
 * P3 ICC profile.
 */
const fixture = new Uint8Array(readFileSync(new URL("../test/fixtures/phone-photo-with-gps.jpg", import.meta.url)));

const image = (width: number, height: number, format: "jpeg" | "png" | "webp" | "gif" = "jpeg") =>
  sharp({ create: { width, height, channels: 3, background: "#3a7d44" } })
    .toFormat(format)
    .toBuffer()
    .then((buffer) => new Uint8Array(buffer));

describe("the privacy fixture", () => {
  it("carries a GPS location, camera details, XMP and an ICC profile", async () => {
    expect(jpegGpsLatitude(fixture)).toEqual([44, 29, 30]);
    const markers = jpegSegments(fixture).map(([marker]) => marker);
    expect(markers).toContain(0xe1); // APP1: EXIF and XMP
    expect(markers).toContain(0xe2); // APP2: ICC profile
    const header = await sharp(fixture).metadata();
    expect({ exif: Boolean(header.exif), xmp: Boolean(header.xmp), icc: Boolean(header.icc), orientation: header.orientation }).toEqual({
      exif: true,
      xmp: true,
      icc: true,
      orientation: 6,
    });
  });
});

describe("createImageProcessor", () => {
  const processor = createImageProcessor(sharp, UPLOAD_LIMITS);

  it("strips every piece of metadata, the location included, from every stored size", async () => {
    const photo = await processor.process(fixture);
    for (const size of Object.values(PhotoSize)) {
      const { bytes } = photo[size];
      // A WebP with no metadata is a single image chunk; EXIF, XMP and ICCP would be chunks of their own.
      expect(webpChunks(bytes)).toEqual(["VP8 "]);
      const header = await sharp(bytes).metadata();
      expect({ format: header.format, exif: header.exif, xmp: header.xmp, icc: header.icc, orientation: header.orientation }).toEqual({
        format: "webp",
        exif: undefined,
        xmp: undefined,
        icc: undefined,
        orientation: undefined,
      });
      expect(Buffer.from(bytes).includes("iPhone")).toBe(false);
    }
  });

  it("turns a photo stored on its side upright", async () => {
    const photo = await processor.process(fixture);
    expect([photo.hero.width, photo.hero.height]).toEqual([600, 800]);
    // The red bar on the stored image's left edge is along the top once upright.
    const { data } = await sharp(photo.hero.bytes).raw().toBuffer({ resolveWithObject: true });
    const [r, g] = [data[(10 * 600 + 300) * 3] ?? 0, data[(10 * 600 + 300) * 3 + 1] ?? 0];
    expect(r).toBeGreaterThan(150);
    expect(g).toBeLessThan(100);
  });

  it.each([
    { name: "a wide photo", width: 4032, height: 3024, hero: [1280, 960], card: [330, 248] },
    { name: "a photo narrower than the hero", width: 900, height: 600, hero: [900, 600], card: [330, 220] },
  ])("stores $name at the hero and card widths without enlarging it", async ({ width, height, hero, card }) => {
    const photo = await processor.process(await image(width, height));
    expect([photo.hero.width, photo.hero.height]).toEqual(hero);
    expect([photo.card.width, photo.card.height]).toEqual(card);
  });

  it.each(["png", "webp"] as const)("accepts a %s photo", async (format) => {
    const photo = await processor.process(await image(800, 600, format));
    expect(photo.hero.width).toBe(800);
  });

  it.each([
    { name: "a GIF", input: () => image(800, 600, "gif") },
    { name: "a file that isn't an image", input: () => Promise.resolve(new TextEncoder().encode("not an image at all")) },
    { name: "a truncated JPEG", input: async () => (await image(800, 600)).subarray(0, 200) },
  ])("refuses $name as photo_unsupported", async ({ input }) => {
    await expect(processor.process(await input())).rejects.toMatchObject({ status: 400, code: ErrorCode.PhotoUnsupported });
  });

  it("refuses a photo narrower than the minimum once upright", async () => {
    await expect(processor.process(await image(499, 800))).rejects.toMatchObject({ status: 400, code: ErrorCode.PhotoTooNarrow });
  });

  it("refuses more pixels than the limit before decoding them", async () => {
    const small: UploadLimits = { ...UPLOAD_LIMITS, maxPixels: 1_000_000 };
    await expect(createImageProcessor(sharp, small).process(await image(1200, 900))).rejects.toMatchObject({ status: 413, code: ErrorCode.PhotoTooLarge });
  });

  it("processes photos one at a time and keeps going after a failure", async () => {
    const results = await Promise.allSettled([processor.process(new Uint8Array([1, 2, 3])), processor.process(fixture), processor.process(fixture)]);
    expect(results.map((result) => result.status)).toEqual(["rejected", "fulfilled", "fulfilled"]);
  });
});

describe("loadImageProcessor", () => {
  it("loads sharp and processes a photo", async () => {
    const processor = await loadImageProcessor(UPLOAD_LIMITS);
    expect((await processor.process(fixture)).card.width).toBe(330);
  });
});
