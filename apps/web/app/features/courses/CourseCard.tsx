import type { Course } from "@coursebook/domain/catalog/course";
import type { PublicMember } from "@coursebook/domain/friends/types";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { FriendsPlayed } from "../top-lists/CourseRow";
import type { TopListRef } from "../top-lists/lists";
import { RankPills } from "../top-lists/RankPills";
import { CourseImage } from "./CourseImage";
import { CreditStyle } from "./credit-style";
import styles from "./course-card.module.css";

/**
 * One course as a photo card, the way the member's ranking, the Courses page
 * and a member's list show courses (decision 2026-11-13): the rank, the
 * course's photo (or its toned stand-in), its name, place and published
 * ranks, then any friends who played it and a footer of ticks and buttons.
 *
 * The name links to the course's page and stretches over the whole card, so
 * the photo opens it too; the footer sits above that link, so its buttons
 * still work. Phones get one column with the rank on the photo; wider screens
 * put the rank in its own column, then the photo, then the text.
 *
 * Renders the `<li>` with the hooks the compact rows have
 * (`data-course`, `data-played`), so anything reading a list works in either
 * layout. Put cards in `CourseCards`.
 *
 * @param course - The course.
 * @param rank - Its rank in the list shown.
 * @param href - Its page; omitted for visitors, who can't open one yet.
 * @param current - The published list on screen, whose pill is highlighted.
 * @param played - Whether the member whose list it is played it (a gold
 *   frame); omitted on a ranking, where every course is played.
 * @param friends - Friends who played it, under the ranks.
 * @param footer - Ticks and buttons under the text, e.g. Played and Want to play.
 */
export function CourseCard({
  course,
  rank,
  href,
  current = null,
  played,
  friends = [],
  footer,
}: {
  course: Course;
  rank: number;
  href?: string | undefined;
  current?: TopListRef | null;
  played?: boolean | undefined;
  friends?: readonly PublicMember[];
  footer?: ReactNode;
}) {
  return (
    <li className={styles.card} data-course={course.name} data-played={played}>
      <span className={styles.rank}>{rank}</span>
      <CourseImage course={course} credit={CreditStyle.Chip} className={styles.media} />
      <div className={styles.body}>
        {href ? (
          <Link to={href} className={styles.name}>
            {course.name}
          </Link>
        ) : (
          <span className={styles.name}>{course.name}</span>
        )}
        <span className={styles.place}>{course.location}</span>
        <RankPills course={course} current={current} />
        <FriendsPlayed friends={friends} />
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </li>
  );
}

/**
 * The ordered list that holds `CourseCard`s.
 *
 * @param id - The list's id, which tests and drag code look for (`ranking`, `toplist`).
 * @param label - Its accessible name, e.g. the list's title.
 * @param children - The cards.
 */
export function CourseCards({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <ol id={id} className={styles.cards} aria-label={label}>
      {children}
    </ol>
  );
}
