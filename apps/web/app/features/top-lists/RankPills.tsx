import type { Course } from "@coursebook/domain/catalog/course";
import { cx } from "../../shared/lib/cx";
import { personalRankLabel, rankBadges, sameList, type TopListRef } from "./lists";
import styles from "./top-lists.module.css";

/**
 * Every rank a course holds, as pills in one style: "{whose} #{n}". A
 * member's own Ranking comes first, filled gold ("Your ranking #3"), then
 * the published lists, outlined ("World #8", "USA #2", "Georgia #1"), with
 * the list on screen highlighted.
 *
 * @param course - The course.
 * @param personal - A member's rank for it: `owner` is their display name, null for the viewer.
 * @param current - The published list on screen, whose pill is highlighted.
 */
export function RankPills({
  course,
  personal = null,
  current = null,
}: {
  course: Course;
  personal?: { owner: string | null; rank: number } | null;
  current?: TopListRef | null;
}) {
  const published = rankBadges(course);
  if (!personal && !published.length) return null;
  return (
    <ul className={styles.badges} aria-label="Ranks">
      {personal && <li className={cx(styles.badge, styles.badgePersonal)}>{personalRankLabel(personal.owner, personal.rank)}</li>}
      {published.map((badge) => (
        <li key={badge.list.type + badge.list.scope} className={cx(styles.badge, current && sameList(badge.list, current) && styles.badgeCurrent)}>
          {badge.label} #{badge.rank}
        </li>
      ))}
    </ul>
  );
}
