import type { CoursePhoto } from "@coursebook/domain/catalog/course";
import { originalUrl, PREVIEW_WIDTH, thumbnailUrl } from "./commons";

/** Where a course photo came from; the values of the `photo_source` database enum. */
export enum PhotoSource {
  /** A free-licensed Wikimedia Commons file, picked by a curator. */
  Commons = "commons",
}

/** The columns of a `course_photos` row that a course's view shows. */
export interface StoredPhoto {
  /** The image at display width, or the original when narrower. */
  url: string;
  /** The original image's width in pixels. */
  width: number;
  credit: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

/**
 * The domain photo of a stored row, with a thumbnail for rows and tiles
 * (decision 2026-11-13): Commons' standard 330 px size, so a list of a
 * hundred courses doesn't load a hundred display-size images.
 */
export function toCoursePhoto(row: StoredPhoto): CoursePhoto {
  return {
    url: row.url,
    // Commons is the only source until uploads arrive with R2 (#67), which will store its own sizes.
    thumbUrl: thumbnailUrl(originalUrl(row.url), row.width, PREVIEW_WIDTH),
    credit: row.credit,
    license: row.license,
    licenseUrl: row.licenseUrl,
    sourceUrl: row.sourceUrl,
  };
}
