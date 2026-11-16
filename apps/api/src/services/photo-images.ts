import type { Sharp, SharpOptions } from "sharp";
import { imageProblem, ImageProblem, megabytes, PHOTO_WIDTHS, PhotoSize, type UploadLimits } from "../domain/stored-photo";
import { AppError, ErrorCode } from "./errors";
import { oneAtATime } from "./one-at-a-time";

/**
 * Turns a photo into the files the app stores (issue #67, decision
 * 2026-11-15): upright, sRGB, WebP, at the hero and card widths, with every
 * piece of metadata removed. EXIF (camera, time and GPS location), XMP and
 * the ICC profile are dropped because sharp writes none of them unless
 * asked to (https://sharp.pixelplumbing.com/api-output#keepmetadata), and
 * this module never asks. The colours are converted to sRGB before the
 * profile is dropped, so wide-gamut phone photos keep their look.
 *
 * sharp is a native module and is loaded only when photo storage is
 * configured (`loadImageProcessor`), so a release without storage never
 * touches it.
 */

/** One stored size of a photo. */
export interface ProcessedImage {
  /** WebP, no metadata. */
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** Every stored size of a photo. */
export type ProcessedPhoto = Record<PhotoSize, ProcessedImage>;

/** Makes the stored sizes of a photo. */
export interface ImageProcessor {
  /**
   * Check and convert a photo.
   *
   * Raises:
   *     AppError: 400 `photo_unsupported` when it isn't a JPEG, PNG or WebP
   *         image; 413 `photo_too_large` above the pixel limit; 400
   *         `photo_too_narrow` below the minimum width.
   */
  process(input: Uint8Array): Promise<ProcessedPhoto>;
}

/** WebP quality per size: the hero is seen large; the card is small enough that 80 is indistinguishable. */
const QUALITY: Readonly<Record<PhotoSize, number>> = { [PhotoSize.Hero]: 82, [PhotoSize.Card]: 80 };

/** The member-facing message for an image problem. */
export function imageProblemError(problem: ImageProblem, limits: UploadLimits): AppError {
  switch (problem) {
    case ImageProblem.Unsupported:
      return new AppError(
        400,
        ErrorCode.PhotoUnsupported,
        "That file isn't a JPEG, PNG or WebP photo. iPhone photos in HEIC format: share or export them as JPEG (Most Compatible) and try again.",
      );
    case ImageProblem.TooManyPixels:
      return new AppError(413, ErrorCode.PhotoTooLarge, "That photo has more than " + String(limits.maxPixels / 1_000_000) + " megapixels. Choose a smaller copy.");
    case ImageProblem.TooNarrow:
      return new AppError(400, ErrorCode.PhotoTooNarrow, "That photo is narrower than " + String(limits.minWidth) + " pixels and would look soft. Choose a larger one.");
  }
}

/** The member-facing message for an upload with too many bytes. */
export function tooManyBytesError(limits: UploadLimits): AppError {
  return new AppError(413, ErrorCode.PhotoTooLarge, "That photo is larger than " + megabytes(limits.maxBytes) + ". Choose a smaller copy.");
}

type SharpFactory = (input?: Uint8Array, options?: SharpOptions) => Sharp;

/**
 * An image processor over sharp.
 *
 * Photos are processed one at a time per process: the API has 512 MB, and
 * the most costly accepted photo (a 48 MP progressive JPEG) needs up to
 * about 220 MB above the API's baseline while it is decoded.
 *
 * Args:
 *     sharp: The sharp module's default export.
 *     limits: Pixel and width limits; the byte limit is enforced on the
 *         request body before this runs.
 */
export function createImageProcessor(sharp: SharpFactory, limits: UploadLimits): ImageProcessor {
  const queue = oneAtATime();

  async function convert(input: Uint8Array): Promise<ProcessedPhoto> {
    let header: Awaited<ReturnType<Sharp["metadata"]>>;
    try {
      header = await sharp(input).metadata();
    } catch {
      throw imageProblemError(ImageProblem.Unsupported, limits);
    }
    const problem = imageProblem(header, limits);
    if (problem) throw imageProblemError(problem, limits);

    // Decode once, upright and in sRGB at hero width, then encode both sizes from those pixels.
    let upright: { data: Buffer; info: { width: number; height: number; channels: 1 | 2 | 3 | 4 } };
    try {
      upright = await sharp(input, { limitInputPixels: limits.maxPixels, failOn: "error", autoOrient: true })
        .resize({ width: PHOTO_WIDTHS[PhotoSize.Hero], withoutEnlargement: true })
        .toColourspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw imageProblemError(ImageProblem.Unsupported, limits);
    }
    const raw = { raw: { width: upright.info.width, height: upright.info.height, channels: upright.info.channels } };
    const encode = async (size: PhotoSize): Promise<ProcessedImage> => {
      const { data, info } = await sharp(upright.data, raw)
        .resize({ width: PHOTO_WIDTHS[size], withoutEnlargement: true })
        .webp({ quality: QUALITY[size] })
        .toBuffer({ resolveWithObject: true });
      return { bytes: new Uint8Array(data.buffer, data.byteOffset, data.byteLength), width: info.width, height: info.height };
    };
    return { [PhotoSize.Hero]: await encode(PhotoSize.Hero), [PhotoSize.Card]: await encode(PhotoSize.Card) };
  }

  return { process: (input) => queue(() => convert(input)) };
}

/**
 * Load sharp and make an image processor.
 *
 * libvips' operation cache is turned off, because it keeps decoded images
 * for reuse that a photo upload never has, and its thread pool is kept to
 * two: the API has half a CPU on Render's starter plan, so more threads
 * would add memory rather than speed.
 *
 * Raises:
 *     Error: When sharp's native module can't be loaded (for example a
 *         build for another platform); the caller turns uploads off.
 */
export async function loadImageProcessor(limits: UploadLimits): Promise<ImageProcessor> {
  const { default: sharp } = await import("sharp");
  sharp.cache(false);
  sharp.concurrency(2);
  return createImageProcessor(sharp, limits);
}
