import type { Course } from "@coursebook/domain/catalog/course";
import { cx } from "../../shared/lib/cx";
import { rankBadges, sameList, type TopListRef } from "./lists";
import styles from "./top-lists.module.css";

/**
 * A course's published ranks as pills in one form, "{list} #{n}":
 * "World #8", "USA #2", "Georgia #1", with the list on screen highlighted.
 * A member's own rank is not a pill; it is the big numeral of `PersonalRank`.
 *
 * @param course - The course.
 * @param current - The published list on screen, whose pill is highlighted.
 */
export function RankPills({ course, current = null }: { course: Course; current?: TopListRef | null }) {
  const published = rankBadges(course);
  if (!published.length) return null;
  return (
    <ul className={styles.badges} aria-label="Published ranks">
      {published.map((badge) => (
        <li key={badge.list.type + badge.list.scope} className={cx(styles.badge, current && sameList(badge.list, current) && styles.badgeCurrent)}>
          {badge.label} #{badge.rank}
        </li>
      ))}
    </ul>
  );
}
