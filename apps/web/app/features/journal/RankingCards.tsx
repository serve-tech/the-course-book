import type { Course } from "@coursebook/domain/catalog/course";
import { CourseCard, CourseCards } from "../courses/CourseCard";
import { coursePath } from "../courses/paths";

/**
 * The member's ranking as photo cards, for reading rather than editing.
 * Each card opens the course's page. Reordering happens in the compact
 * Reorder layout, because dragging tall cards through a long list is
 * impractical, especially on a phone (decision 2026-11-13).
 *
 * Keeps the compact list's hooks (`#ranking`, `li[data-course]`) so
 * anything reading the order works in either layout.
 *
 * @param rows - The courses shown, in order, each with its rank in this view.
 */
export function RankingCards({ rows }: { rows: readonly { course: Course; rank: number }[] }) {
  return (
    <CourseCards id="ranking" label="Ranking">
      {rows.map(({ course, rank }) => (
        <CourseCard key={course.id} course={course} rank={rank} href={coursePath(course.id)} />
      ))}
    </CourseCards>
  );
}
