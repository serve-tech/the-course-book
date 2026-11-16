import type { CoursePhoto } from "@coursebook/domain/catalog/course";
import { originalUrl, PREVIEW_WIDTH, thumbnailUrl } from "./commons";
import { storedCardUrl } from "./stored-photo";

/** Where a course photo came from; the values of the `photo_source` database enum. */
export enum PhotoSource {
  /** A free-licensed Wikimedia Commons file, picked by a curator. */
  Commons = "commons",
  /** A photo a curator uploaded, with the credit and license or permission they gave (#67). */
  Upload = "upload",
}

/** The columns of a `course_photos` row that a course's view shows. */
export interface StoredPhoto {
  /** The image at display width, or the original when narrower. */
  url: string;
  /** The width in pixels of the image at `url`'s source: the Commons original, or the stored hero. */
  width: number;
  credit: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
  /** The prefix of the app's own stored copy (`courses/<course>/<photo>`); null when `url` is on Commons. */
  storageKey: string | null;
}

/**
 * The domain photo of a stored row, with a thumbnail for rows and tiles
 * (decision 2026-11-13): 330 px, so a list of a hundred courses doesn't
 * load a hundred display-size images. A photo in the app's own storage has
 * its card size stored beside the hero; a Commons-hosted one uses Commons'
 * standard 330 px thumbnail.
 */
export function toCoursePhoto(row: StoredPhoto): CoursePhoto {
  return {
    url: row.url,
    thumbUrl: row.storageKey ? storedCardUrl(row.url) : thumbnailUrl(originalUrl(row.url), row.width, PREVIEW_WIDTH),
    credit: row.credit,
    license: row.license,
    licenseUrl: row.licenseUrl,
    sourceUrl: row.sourceUrl,
  };
}
