import type { Course } from "@coursebook/domain/catalog/course";
import { cx } from "../../shared/lib/cx";
import { courseTone } from "../social/format";
import { CreditStyle } from "./credit-style";
import styles from "./courses.module.css";

/**
 * A course's photo filling its box, or, when the course has none, a stand-in
 * in the course's tone (contour lines and a flag) so a missing photo reads
 * as designed rather than broken. The box's size and shape come from
 * `className`; the image covers it.
 *
 * @param course - The course shown.
 * @param credit - How the photo's credit is shown. Defaults to a chip.
 * @param alt - The image's alt text. Defaults to empty, for places that
 *   already name the course next to the photo.
 * @param priority - Load the photo straight away (a page's hero) instead of
 *   when it nears the viewport.
 * @param className - Sets the box's size, shape and radius.
 */
export function CourseImage({
  course,
  credit = CreditStyle.Chip,
  alt = "",
  priority = false,
  className,
}: {
  course: Course;
  credit?: CreditStyle;
  alt?: string;
  priority?: boolean;
  className?: string | undefined;
}) {
  const photo = course.photo;
  return (
    <div className={cx(styles.image, className)} data-tone={courseTone(course)} data-photo={photo ? "true" : "false"}>
      {photo ? (
        <img src={photo.url} alt={alt} loading={priority ? "eager" : "lazy"} decoding="async" />
      ) : (
        <FlagIcon />
      )}
      {photo && credit === CreditStyle.Chip && (
        <span className={styles.credit}>
          <CameraIcon />
          {photo.credit}
        </span>
      )}
      {photo && credit === CreditStyle.Link && (
        <a className={styles.credit} href={photo.sourceUrl} target="_blank" rel="noreferrer" title={"Photo: " + photo.credit + ", " + photo.license}>
          <CameraIcon />
          {photo.credit}
        </a>
      )}
    </div>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
      <circle cx="12" cy="13" r="3.4" />
    </svg>
  );
}

function FlagIcon() {
  return (
    <svg className={styles.flag} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 41V7" />
      <path d="M17 8l15 5.5L17 19" fill="currentColor" fillOpacity={0.35} />
      <ellipse cx="17" cy="41.5" rx="9" ry="2" />
    </svg>
  );
}
