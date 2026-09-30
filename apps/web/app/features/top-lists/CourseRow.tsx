import type { Course } from "@coursebook/domain/catalog/course";
import type { ReactNode } from "react";
import { CourseTile } from "../social/CourseTile";
import { TileSize } from "../social/sizes";
import { cx } from "../../shared/lib/cx";
import { CheckIcon } from "./icons";
import type { TopListRef } from "./lists";
import { RankPills } from "./RankPills";
import styles from "./top-lists.module.css";

/** A tick on a row: who played the course. */
export interface PlayedMark {
  label: string;
  /** The viewer's own mark, in the viewer's color, next to a friend's. */
  you: boolean;
  /** Opens the viewer's rounds at the course (to delete one); only on the viewer's own tick. */
  onClick?: () => void;
}

/**
 * One course in a list: its rank here, name and place, its rank on every
 * list it is on (the current list highlighted), who played it, and the
 * actions. A row the list's member played gets a gold edge.
 *
 * @param course - The course.
 * @param rank - Its rank on the list shown; null hides the number (Want to play).
 * @param current - The list shown, whose badge is highlighted.
 * @param played - Whether the member whose list it is played it.
 * @param marks - Ticks to show, e.g. "Marcus" and "You".
 * @param note - Extra text before the marks, e.g. "3 rounds".
 * @param actions - Buttons at the end of the row.
 */
export function CourseRow({
  course,
  rank,
  current,
  played,
  marks,
  note,
  actions,
}: {
  course: Course;
  rank: number | null;
  current: TopListRef | null;
  played: boolean;
  marks: readonly PlayedMark[];
  note?: ReactNode;
  actions: ReactNode;
}) {
  return (
    <li className={styles.row} data-played={played} data-course={course.name}>
      <span className={styles.rank}>{rank ?? ""}</span>
      <CourseTile course={course} size={TileSize.Mini} />
      <div className={styles.main}>
        <div className={styles.name}>{course.name}</div>
        <div className={styles.place}>{course.location}</div>
        <RankPills course={course} current={current} />
      </div>
      <div className={styles.marks}>
        {note && <span className={styles.note}>{note}</span>}
        {marks.map((mark) =>
          mark.onClick ? (
            <button
              key={mark.label}
              type="button"
              className={cx(styles.mark, styles.markButton, mark.you && styles.markYou)}
              aria-label={"Your rounds at " + course.name}
              title="See or delete your rounds"
              onClick={mark.onClick}
            >
              <CheckIcon />
              {mark.label}
            </button>
          ) : (
            <span key={mark.label} className={cx(styles.mark, mark.you && styles.markYou)}>
              <CheckIcon />
              {mark.label}
            </span>
          ),
        )}
      </div>
      {actions}
    </li>
  );
}
