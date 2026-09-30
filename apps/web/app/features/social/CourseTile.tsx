import type { Course } from "@coursebook/domain/catalog/course";
import type { ReactNode } from "react";
import { courseTone, shortPlace } from "./format";
import { TileSize } from "./sizes";
import styles from "./social.module.css";

const SIZE_CLASS: Record<TileSize, string | undefined> = {
  [TileSize.Poster]: undefined,
  [TileSize.Thumb]: styles.tileThumb,
  [TileSize.Mini]: styles.tileMini,
};

/**
 * A course's poster. Courses have no key art (the catalog has logos for a
 * handful), so the tile is typographic: a rank numeral, the name, the place,
 * over a tone taken from the ground the course sits on.
 *
 * @param course - The course shown.
 * @param number - The numeral in the corner, usually a rank in context; omitted when null.
 * @param size - Defaults to a poster that fills its grid cell.
 * @param badge - Overlay in the top right corner, e.g. a friend's avatar.
 */
export function CourseTile({
  course,
  number = null,
  size = TileSize.Poster,
  badge,
}: {
  course: Course;
  number?: number | null;
  size?: TileSize;
  badge?: ReactNode;
}) {
  const place = shortPlace(course);
  return (
    <div
      className={[styles.tile, SIZE_CLASS[size]].filter(Boolean).join(" ")}
      data-tone={courseTone(course)}
      role={size === TileSize.Poster ? "img" : undefined}
      aria-label={size === TileSize.Poster ? course.name + (place ? ", " + place : "") : undefined}
      aria-hidden={size === TileSize.Poster ? undefined : true}
    >
      <span className={styles.tileNumber}>{number ?? ""}</span>
      <span className={styles.tileText}>
        <span className={styles.tileName}>{course.name}</span>
        {place && <span className={styles.tilePlace}>{place}</span>}
      </span>
      {badge && <span className={styles.tileBadge}>{badge}</span>}
    </div>
  );
}
