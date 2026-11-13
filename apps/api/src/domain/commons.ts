import type { CommonsCandidate } from "@coursebook/domain/curation/types";
import { z } from "zod";

/**
 * Pure rules for picking course photos from Wikimedia Commons (decision
 * 2026-11-13): which licenses the app accepts, how a file's credit reads,
 * and which image URL to show. The client in `services/commons.ts` fetches;
 * this decides.
 *
 * Commons hosts only free content, but its licenses differ in what they ask
 * of a reuser. The app accepts public domain, CC0 and CC BY / CC BY-SA in
 * any version, whose terms the photo's credit and license link satisfy.
 * Anything else (GFDL-only, Free Art License, unknown) is left out rather
 * than judged case by case.
 *
 * Reference: https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia
 */

/** Widths Wikimedia pre-renders; other widths may be throttled for outside sites. */
export const DISPLAY_WIDTH = 1280;
export const PREVIEW_WIDTH = 330;
/** Narrower photos look soft as a course's hero; they are not offered. */
export const MIN_WIDTH = 500;

const BITMAP_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const FREE_LICENSE = /^(public domain|no restrictions|cc0(\s.*)?|cc by(-sa)? \d(\.\d)?(\s.*)?)$/i;

const metaValue = z.object({ value: z.union([z.string(), z.number()]).transform(String) }).optional();

/** One Commons file as the MediaWiki API's `imageinfo` describes it. */
export const commonsPageSchema = z.object({
  title: z.string(),
  /** A search result's position, best first; absent on a lookup by title. */
  index: z.number().int().optional(),
  missing: z.boolean().optional(),
  imageinfo: z
    .array(
      z.object({
        url: z.url(),
        descriptionurl: z.url(),
        thumburl: z.url().optional(),
        width: z.number().int(),
        height: z.number().int(),
        mime: z.string(),
        extmetadata: z
          .object({
            Artist: metaValue,
            LicenseShortName: metaValue,
            LicenseUrl: metaValue,
            ImageDescription: metaValue,
          })
          .default({}),
      }),
    )
    .optional(),
});
export type CommonsPage = z.infer<typeof commonsPageSchema>;

/** A `query` response's pages; absent when a search finds nothing. */
export const commonsQuerySchema = z.object({
  query: z.object({ pages: z.array(commonsPageSchema).default([]) }).optional(),
});

/** Commons metadata is HTML; credits and descriptions are shown as text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** An absolute https URL from Commons metadata, which sometimes omits the scheme; null when unusable. */
export function absoluteUrl(value: string | undefined): string | null {
  const text = plainText(value ?? "");
  const candidate = text.startsWith("//") ? "https:" + text : text;
  return URL.canParse(candidate) && /^https?:$/.test(new URL(candidate).protocol) ? candidate : null;
}

/** Whether the app accepts a Commons license, by its short name. */
export function isAcceptedLicense(shortName: string): boolean {
  return FREE_LICENSE.test(shortName.trim());
}

/**
 * The URL of a Commons image at `width`, or the original when it is not
 * wider than that. Thumbnails live under `/thumb/`, named `<width>px-<file>`.
 *
 * Example:
 *     >>> thumbnailUrl("https://upload.wikimedia.org/wikipedia/commons/8/8a/A.jpg", 2000, 1280)
 *     "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/A.jpg/1280px-A.jpg"
 */
export function thumbnailUrl(originalUrl: string, originalWidth: number, width: number): string {
  // Commons adds utm_* tracking parameters to the URLs it returns; the image doesn't need them.
  const url = new URL(originalUrl);
  url.search = "";
  if (originalWidth <= width) return url.toString();
  const parts = url.pathname.split("/");
  const file = parts.at(-1);
  const commons = parts.indexOf("commons");
  if (!file || commons < 0) return url.toString();
  parts.splice(commons + 1, 0, "thumb");
  url.pathname = parts.join("/") + "/" + String(width) + "px-" + file;
  return url.toString();
}

/** A Commons file the app can use: its candidate details and the URL to show. */
export interface CommonsPhoto extends CommonsCandidate {
  /** The image at display width, or the original when narrower. */
  url: string;
}

/**
 * The usable photo a Commons page describes.
 *
 * Returns:
 *     The photo, or null when the file is missing, not a bitmap photo,
 *     narrower than `MIN_WIDTH`, or under a license the app does not accept.
 */
export function commonsPhoto(page: CommonsPage): CommonsPhoto | null {
  const info = page.imageinfo?.[0];
  if (page.missing || !info) return null;
  if (!BITMAP_TYPES.has(info.mime) || info.width < MIN_WIDTH) return null;
  const meta = info.extmetadata;
  const license = plainText(meta.LicenseShortName?.value ?? "");
  if (!isAcceptedLicense(license)) return null;
  return {
    file: page.title,
    url: thumbnailUrl(info.url, info.width, DISPLAY_WIDTH),
    thumbUrl: info.thumburl ?? thumbnailUrl(info.url, info.width, PREVIEW_WIDTH),
    width: info.width,
    height: info.height,
    credit: plainText(meta.Artist?.value ?? "") || "Wikimedia Commons",
    license,
    licenseUrl: absoluteUrl(meta.LicenseUrl?.value),
    sourceUrl: info.descriptionurl,
    description: plainText(meta.ImageDescription?.value ?? "").slice(0, 280),
  };
}

/** A photo's details for the results grid, without the display URL. */
export function toCandidate(photo: CommonsPhoto): CommonsCandidate {
  return {
    file: photo.file,
    thumbUrl: photo.thumbUrl,
    width: photo.width,
    height: photo.height,
    credit: photo.credit,
    license: photo.license,
    licenseUrl: photo.licenseUrl,
    sourceUrl: photo.sourceUrl,
    description: photo.description,
  };
}
