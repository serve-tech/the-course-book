import type { Course } from "@coursebook/domain/catalog/course";
import { Link } from "react-router";
import { CourseImage } from "../courses/CourseImage";
import { CreditStyle } from "../courses/credit-style";
import { coursePath } from "../courses/paths";
import { RankPills } from "../top-lists/RankPills";
import styles from "./ranking-cards.module.css";

/**
 * The member's ranking as photo cards, for reading rather than editing: the
 * rank, the course's photo (or its toned stand-in), its name, place and
 * published ranks. Each card opens the course's page. Reordering happens in
 * the compact Reorder layout, because dragging tall cards through a long
 * list is impractical, especially on a phone (decision 2026-11-13).
 *
 * Phones get one column, with the rank over the photo; wider screens put
 * the rank in its own column, then the photo, then the text.
 *
 * Keeps the compact list's hooks (`#ranking`, `li[data-course]`) so
 * anything reading the order works in either layout.
 *
 * @param rows - The courses shown, in order, each with its rank in this view.
 */
export function RankingCards({ rows }: { rows: readonly { course: Course; rank: number }[] }) {
  return (
    <ol id="ranking" className={styles.cards} aria-label="Ranking">
      {rows.map(({ course, rank }) => (
        <li key={course.id} className={styles.card} data-course={course.name}>
          <Link to={coursePath(course.id)} className={styles.link}>
            <span className={styles.rank}>{rank}</span>
            <CourseImage course={course} credit={CreditStyle.Chip} className={styles.media} />
            <span className={styles.body}>
              <span className={styles.name}>{course.name}</span>
              <span className={styles.place}>{course.location}</span>
              <RankPills course={course} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
