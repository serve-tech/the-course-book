import { DISPLAY_WIDTH, MIN_WIDTH, PREVIEW_WIDTH } from "./commons";

/**
 * Pure rules for course photos kept in the app's own object storage
 * (Cloudflare R2, issue #67): where each size is stored, the address it is
 * served from, and which uploads the API accepts.
 *
 * Every photo is stored as two WebP files under a prefix of its own,
 * `courses/<courseId>/<photoId>/`: `hero.webp` (the course page, 1280 px)
 * and `card.webp` (rows and tiles, 330 px), the same widths the app shows
 * Commons photos at. A new photo always gets a new prefix, so a stored file
 * never changes and can be cached for a year.
 */

/** The sizes stored for every photo. */
export enum PhotoSize {
  /** The course page and the featured cards: 1280 px wide, or the original when narrower. */
  Hero = "hero",
  /** Rows and small tiles: 330 px wide, or the original when narrower. */
  Card = "card",
}

/** Each size's width in pixels. */
export const PHOTO_WIDTHS: Readonly<Record<PhotoSize, number>> = {
  [PhotoSize.Hero]: DISPLAY_WIDTH,
  [PhotoSize.Card]: PREVIEW_WIDTH,
};

/** Stored files are WebP. */
export const STORED_PHOTO_TYPE = "image/webp";

/** A stored file never changes (each photo has its own prefix), so browsers and Cloudflare may keep it a year. */
export const STORED_PHOTO_CACHE_CONTROL = "public, max-age=31536000, immutable";

/**
 * The storage prefix of one photo of a course.
 *
 * Example:
 *     >>> photoPrefix("6f1c…", "0b7e…")
 *     "courses/6f1c…/0b7e…"
 */
export function photoPrefix(courseId: string, photoId: string): string {
  return "courses/" + courseId + "/" + photoId;
}

/** The object key of one size of a stored photo: `<prefix>/hero.webp`. */
export function photoKey(prefix: string, size: PhotoSize): string {
  return prefix + "/" + size + ".webp";
}

/** Every object key a stored photo has, hero first. */
export function photoKeys(prefix: string): string[] {
  return Object.values(PhotoSize).map((size) => photoKey(prefix, size));
}

/**
 * The public address of a stored object: the bucket's public URL (its custom
 * domain, e.g. `https://photos.coursebook.golf`) followed by the key.
 */
export function publicPhotoUrl(publicBaseUrl: string, key: string): string {
  return publicBaseUrl.replace(/\/+$/, "") + "/" + key.split("/").map(encodeURIComponent).join("/");
}

/**
 * The card-size address of a stored photo, from its hero address: the two
 * files sit side by side under the photo's prefix.
 *
 * Example:
 *     >>> storedCardUrl("https://photos.coursebook.golf/courses/c/p/hero.webp")
 *     "https://photos.coursebook.golf/courses/c/p/card.webp"
 */
export function storedCardUrl(heroUrl: string): string {
  return new URL(PhotoSize.Card + ".webp", heroUrl).toString();
}

/** Image formats an upload may be, as the image decoder names them. */
export enum UploadFormat {
  Jpeg = "jpeg",
  Png = "png",
  Webp = "webp",
}

/**
 * Content types the upload field asks browsers for, JPEG first. iOS Safari
 * converts a HEIC photo to the first type an `accept` list names
 * (https://bugs.webkit.org/show_bug.cgi?id=292350), so JPEG must lead.
 */
export const UPLOAD_CONTENT_TYPES: readonly string[] = ["image/jpeg", "image/png", "image/webp"];

/** What an upload may be, checked before any file is stored. */
export interface UploadLimits {
  /** The largest request body, in bytes. */
  maxBytes: number;
  /** The most pixels (width × height) the decoder may read. */
  maxPixels: number;
  /** The narrowest photo accepted, after rotating it upright. */
  minWidth: number;
}

/**
 * The limits for uploads (decision 2026-11-15). Phones send 3 to 12 MB
 * photos; a 48-megapixel phone photo saved as JPEG fits under 25 MB. A
 * 48 MP progressive JPEG, the most costly accepted input measured, peaked
 * at about 150 MB above the API's baseline. The minimum width is the one
 * Commons photos must meet.
 */
export const UPLOAD_LIMITS: UploadLimits = {
  maxBytes: 25 * 1024 * 1024,
  maxPixels: 50_000_000,
  minWidth: MIN_WIDTH,
};

/** Why an image can't be used. */
export enum ImageProblem {
  /** Not a JPEG, PNG or WebP image (for example HEIC, GIF, or not an image at all). */
  Unsupported = "unsupported",
  /** More pixels than `maxPixels`. */
  TooManyPixels = "too_many_pixels",
  /** Narrower than `minWidth` once upright. */
  TooNarrow = "too_narrow",
}

/** What the decoder reports about an image before reading its pixels. */
export interface ImageHeader {
  /** The decoder's name for the format, e.g. `jpeg` or `heif`; absent when unreadable. */
  format?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  /** The EXIF orientation, 1 to 8; 5 to 8 mean the photo is stored on its side. */
  orientation?: number | undefined;
}

/**
 * Whether an image may be stored, judged from its header alone.
 *
 * Args:
 *     header: The decoder's reading of the file.
 *     limits: The upload limits.
 *
 * Returns:
 *     The problem, or null when the image is usable.
 */
export function imageProblem(header: ImageHeader, limits: UploadLimits): ImageProblem | null {
  const { format, width, height } = header;
  if (!Object.values(UploadFormat).some((accepted) => accepted.valueOf() === format)) return ImageProblem.Unsupported;
  if (!width || !height) return ImageProblem.Unsupported;
  if (width * height > limits.maxPixels) return ImageProblem.TooManyPixels;
  const upright = (header.orientation ?? 1) >= 5 ? height : width;
  if (upright < limits.minWidth) return ImageProblem.TooNarrow;
  return null;
}

/** "25 MB": a byte count as members read it. */
export function megabytes(bytes: number): string {
  return String(Math.round(bytes / (1024 * 1024))) + " MB";
}
