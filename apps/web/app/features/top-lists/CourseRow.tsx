import type { Course } from "@coursebook/domain/catalog/course";
import type { PublicMember } from "@coursebook/domain/friends/types";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { CourseImage } from "../courses/CourseImage";
import { CreditStyle } from "../courses/credit-style";
import { Avatar } from "../social/Avatar";
import { AvatarSize } from "../social/sizes";
import { cx } from "../../shared/lib/cx";
import { CheckIcon } from "./icons";
import { friendsLine, type TopListRef } from "./lists";
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
 * One course in a list: its rank here, its photo, name and place, its rank
 * on every list it is on (the current list highlighted), who played it, and
 * the actions. A row the list's member played gets a gold edge.
 *
 * Rows show a small photo; a featured row (a list's top three, decision
 * 2026-11-13) is the same markup laid out as a photo card, so the list stays
 * one `<ol>` whichever way its courses are drawn. With `href`, the name
 * links to the course's page and the link covers the row; the ticks and
 * buttons sit above it and keep working.
 *
 * @param course - The course.
 * @param rank - Its rank on the list shown; null hides the number (Want to play).
 * @param current - The list shown, whose badge is highlighted.
 * @param played - Whether the member whose list it is played it; omitted on a
 *   ranking, where every course is played, so no row is singled out.
 * @param marks - Ticks to show, e.g. "Marcus" and "You".
 * @param note - Extra text before the marks, e.g. "3 rounds".
 * @param friends - Friends who played it, shown under the name.
 * @param actions - Buttons at the end of the row; omitted when there are none.
 * @param href - The course's page; omitted where it can't be opened (visitors).
 * @param featured - Draw the row as a photo card, for a list's top three.
 */
export function CourseRow({
  course,
  rank,
  current,
  played,
  marks,
  note,
  friends = [],
  actions,
  href,
  featured = false,
}: {
  course: Course;
  rank: number | null;
  current: TopListRef | null;
  played?: boolean;
  marks: readonly PlayedMark[];
  note?: ReactNode;
  friends?: readonly PublicMember[];
  actions?: ReactNode;
  href?: string | undefined;
  featured?: boolean;
}) {
  return (
    <li className={cx(styles.row, featured && styles.featured)} data-played={played} data-course={course.name} data-featured={featured || undefined}>
      <span className={styles.rank}>{rank ?? ""}</span>
      <CourseSummary course={course} current={current} friends={friends} href={href} featured={featured} />
      <PlayedMarks course={course} marks={marks} note={note} />
      {actions}
    </li>
  );
}

/**
 * The middle of a course row as two grid cells: the course's photo, then its
 * name, place, published ranks and the friends who played it. The Ranking
 * tab's draggable rows use it too, so every list reads the same.
 *
 * @param course - The course.
 * @param current - The published list on screen, whose badge is highlighted.
 * @param friends - Friends who played it, shown under the name.
 * @param href - The course's page, linked from the name.
 * @param featured - A photo card's full-size photo and credit, rather than a thumbnail.
 */
export function CourseSummary({
  course,
  current,
  friends = [],
  href,
  featured = false,
}: {
  course: Course;
  current: TopListRef | null;
  friends?: readonly PublicMember[];
  href?: string | undefined;
  featured?: boolean;
}) {
  return (
    <>
      <div className={styles.tileCell}>
        <CourseImage course={course} thumbnail={!featured} credit={featured ? CreditStyle.Chip : CreditStyle.None} className={styles.photo} />
      </div>
      <div className={styles.main}>
        {href ? (
          <Link to={href} className={cx(styles.name, styles.nameLink)}>
            {course.name}
          </Link>
        ) : (
          <div className={styles.name}>{course.name}</div>
        )}
        <div className={styles.place}>{course.location}</div>
        <RankPills course={course} current={current} />
        <FriendsPlayed friends={friends} />
      </div>
    </>
  );
}

/**
 * The viewer's friends who played a course: up to three avatars, then
 * "Priya and 2 other friends played it". Renders nothing without friends.
 *
 * @param friends - Friends who played it.
 */
export function FriendsPlayed({ friends }: { friends: readonly PublicMember[] }) {
  if (!friends.length) return null;
  return (
    <div className={styles.friends}>
      <span className={styles.friendAvatars} aria-hidden="true">
        {friends.slice(0, 3).map((friend) => (
          <Avatar key={friend.username} member={friend} size={AvatarSize.ExtraSmall} />
        ))}
      </span>
      {friendsLine(friends)}
    </div>
  );
}

/**
 * A row's ticks, after an optional note. A mark with `onClick` is the
 * viewer's own tick and opens their rounds at the course.
 *
 * @param course - The course, named in the tick button's label.
 * @param marks - Ticks to show.
 * @param note - Extra text before the marks.
 */
export function PlayedMarks({ course, marks, note }: { course: Course; marks: readonly PlayedMark[]; note?: ReactNode }) {
  return (
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
  );
}
