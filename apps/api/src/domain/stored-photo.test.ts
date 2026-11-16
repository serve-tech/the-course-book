import { describe, expect, it } from "vitest";
import {
  ImageProblem,
  imageProblem,
  megabytes,
  photoKey,
  photoKeys,
  photoPrefix,
  PhotoSize,
  publicPhotoUrl,
  storedCardUrl,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_LIMITS,
  type ImageHeader,
} from "./stored-photo";

describe("stored photo keys and addresses", () => {
  it("keeps each photo's sizes under a prefix of its own", () => {
    const prefix = photoPrefix("course-1", "photo-1");
    expect(prefix).toBe("courses/course-1/photo-1");
    expect(photoKey(prefix, PhotoSize.Hero)).toBe("courses/course-1/photo-1/hero.webp");
    expect(photoKeys(prefix)).toEqual(["courses/course-1/photo-1/hero.webp", "courses/course-1/photo-1/card.webp"]);
  });

  it.each([
    { base: "https://photos.coursebook.golf", url: "https://photos.coursebook.golf/courses/c/p/hero.webp" },
    { base: "https://photos.coursebook.golf/", url: "https://photos.coursebook.golf/courses/c/p/hero.webp" },
    { base: "http://localhost:9310/coursebook-photos-dev", url: "http://localhost:9310/coursebook-photos-dev/courses/c/p/hero.webp" },
  ])("serves objects under $base", ({ base, url }) => {
    expect(publicPhotoUrl(base, "courses/c/p/hero.webp")).toBe(url);
  });

  it("encodes each key segment but keeps the slashes", () => {
    expect(publicPhotoUrl("https://photos.test", "courses/a b/p#1/hero.webp")).toBe("https://photos.test/courses/a%20b/p%231/hero.webp");
  });

  it("finds the card beside the hero", () => {
    expect(storedCardUrl("https://photos.coursebook.golf/courses/c/p/hero.webp")).toBe("https://photos.coursebook.golf/courses/c/p/card.webp");
  });

  it("asks browsers for JPEG first, so iOS converts HEIC photos to JPEG", () => {
    expect(UPLOAD_CONTENT_TYPES[0]).toBe("image/jpeg");
  });
});

describe("imageProblem", () => {
  const header = (overrides: Partial<ImageHeader>): ImageHeader => ({ format: "jpeg", width: 4032, height: 3024, orientation: 1, ...overrides });

  it.each([
    { name: "a 12 MP JPEG", input: header({}), problem: null },
    { name: "a 48 MP JPEG", input: header({ width: 8064, height: 6048 }), problem: null },
    { name: "a PNG", input: header({ format: "png" }), problem: null },
    { name: "a WebP", input: header({ format: "webp" }), problem: null },
    { name: "a HEIC photo", input: header({ format: "heif" }), problem: ImageProblem.Unsupported },
    { name: "a GIF", input: header({ format: "gif" }), problem: ImageProblem.Unsupported },
    { name: "an unreadable file", input: header({ format: undefined }), problem: ImageProblem.Unsupported },
    { name: "an image without a size", input: header({ width: undefined }), problem: ImageProblem.Unsupported },
    { name: "a 200 MP photo", input: header({ width: 16320, height: 12240 }), problem: ImageProblem.TooManyPixels },
    { name: "a photo 499 px wide", input: header({ width: 499, height: 400 }), problem: ImageProblem.TooNarrow },
    { name: "a photo 500 px wide", input: header({ width: 500, height: 400 }), problem: null },
    { name: "a portrait stored on its side, 400 px wide upright", input: header({ width: 900, height: 400, orientation: 6 }), problem: ImageProblem.TooNarrow },
    { name: "a portrait stored on its side, 600 px wide upright", input: header({ width: 800, height: 600, orientation: 8 }), problem: null },
  ])("judges $name", ({ input, problem }) => {
    expect(imageProblem(input, UPLOAD_LIMITS)).toBe(problem);
  });
});

describe("megabytes", () => {
  it.each([
    [25 * 1024 * 1024, "25 MB"],
    [1.6 * 1024 * 1024, "2 MB"],
  ])("reads %d bytes as %s", (bytes, text) => {
    expect(megabytes(bytes)).toBe(text);
  });
});
