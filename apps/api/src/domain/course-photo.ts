import type { CoursePhoto } from "@coursebook/domain/catalog/course";

/** Where a course photo came from; the values of the `photo_source` database enum. */
export enum PhotoSource {
  /** A free-licensed Wikimedia Commons file, picked by a curator. */
  Commons = "commons",
}

/** The columns of a `course_photos` row that a course's view shows. */
export interface StoredPhoto {
  url: string;
  credit: string;
  license: string;
  licenseUrl: string | null;
  sourceUrl: string;
}

/** The domain photo of a stored row. */
export function toCoursePhoto(row: StoredPhoto): CoursePhoto {
  return { url: row.url, credit: row.credit, license: row.license, licenseUrl: row.licenseUrl, sourceUrl: row.sourceUrl };
}
