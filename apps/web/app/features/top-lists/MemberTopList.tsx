import { useState } from "react";
import { Link } from "react-router";
import type { Course, RankedCourse } from "@coursebook/domain/catalog/course";
import { topListTitle } from "@coursebook/domain/social/top-lists";
import type { ViewerCourses } from "../../lib/api/viewer";
import { countLabel } from "../../shared/lib/count-label";
import { cx } from "../../shared/lib/cx";
import type { Notify } from "../../shared/ui/shell";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { RoundHistory } from "../rounds/RoundHistory";
import { CourseActions } from "./CourseActions";
import { CourseRow, type PlayedMark } from "./CourseRow";
import { filterEntries, PlayedFilter, playedCount, type TopListRef } from "./lists";
import styles from "./top-lists.module.css";

/** Filters on a member's list; "Only them" is a friend's courses the viewer hasn't played. */
enum MemberFilter {
  All = "all",
  Played = "played",
  OnlyThem = "only-them",
  NotPlayed = "not-played",
}

/**
 * One published list through a member's eyes: every course, ticked where
 * they played it and, on a friend's page, where you did too. Rows keep the
 * Courses page's buttons, so spotting that a friend played Shinnecock is one
 * tap from wanting to play it.
 *
 * @param list - The list shown.
 * @param entries - Its entries in rank order.
 * @param name - The member's display name.
 * @param self - Whether it is the viewer's own page.
 * @param memberPlayed - Ids of the courses the member played.
 * @param viewer - The viewer's courses and Want to play list.
 * @param backTo - The member's Lists tab.
 */
export function MemberTopList({
  list,
  entries,
  name,
  self,
  memberPlayed,
  viewer,
  backTo,
  notify,
  openAuth,
}: {
  list: TopListRef;
  entries: readonly RankedCourse[];
  name: string;
  self: boolean;
  memberPlayed: ReadonlySet<string>;
  viewer: ViewerCourses;
  backTo: string;
  notify: Notify;
  openAuth: () => void;
}) {
  const [filter, setFilter] = useState(MemberFilter.All);
  const [logging, setLogging] = useState<Course | null>(null);
  const [history, setHistory] = useState<Course | null>(null);
  const youPlayed = new Set(Object.entries(viewer.played).flatMap(([id, rounds]) => (rounds > 0 ? [id] : [])));
  const onlyThem = new Set([...memberPlayed].filter((id) => !youPlayed.has(id)));
  const wanted = new Set(viewer.wanted);
  const title = topListTitle(list.type, list.scope);
  const theirs = playedCount(entries, memberPlayed);
  const yours = playedCount(entries, youPlayed);
  const shown =
    filter === MemberFilter.OnlyThem
      ? filterEntries(entries, { filter: PlayedFilter.Played, played: onlyThem, query: "" })
      : filterEntries(entries, {
          filter: filter === MemberFilter.Played ? PlayedFilter.Played : filter === MemberFilter.NotPlayed ? PlayedFilter.NotPlayed : PlayedFilter.All,
          played: memberPlayed,
          query: "",
        });

  const filters: [MemberFilter, string][] = [
    [MemberFilter.All, countLabel("All", entries.length)],
    [MemberFilter.Played, countLabel(self ? "Played" : name + " played", theirs)],
  ];
  if (!self) filters.push([MemberFilter.OnlyThem, countLabel("Only " + name, playedCount(entries, onlyThem))]);
  filters.push([MemberFilter.NotPlayed, countLabel("Not played", entries.length - theirs)]);

  const marks = (course: Course): PlayedMark[] => {
    const openRounds = () => {
      setHistory(course);
    };
    if (self) return memberPlayed.has(course.id) ? [{ label: "Played", you: false, onClick: openRounds }] : [];
    return [
      ...(memberPlayed.has(course.id) ? [{ label: name, you: false }] : []),
      ...(youPlayed.has(course.id) ? [{ label: "You", you: true, onClick: openRounds }] : []),
    ];
  };

  return (
    <section className={styles.page} aria-labelledby="memberListTitle">
      <div className={styles.head}>
        <div>
          <Link className={styles.back} to={backTo}>
            ← Lists
          </Link>
          <h2 id="memberListTitle" className={styles.title}>
            {title}
          </h2>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressLine}>
            <span>{self ? "You" : name}</span>
            <span>
              <b>{theirs}</b>
              <small>/ {entries.length}</small>
            </span>
          </div>
          <div className={styles.bar} role="progressbar" aria-label={(self ? "You" : name) + " played"} aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={theirs}>
            <span style={{ width: String(entries.length ? (100 * theirs) / entries.length : 0) + "%" }} />
          </div>
          {!self && (
            <>
              <div className={styles.progressLine}>
                <span>You</span>
                <span>
                  <b>{yours}</b>
                  <small>/ {entries.length}</small>
                </span>
              </div>
              <div className={cx(styles.bar, styles.barYou)} role="progressbar" aria-label="You played" aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={yours}>
                <span style={{ width: String(entries.length ? (100 * yours) / entries.length : 0) + "%" }} />
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.filters} role="group" aria-label="Show courses">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={styles.filter}
              aria-pressed={filter === value}
              onClick={() => {
                setFilter(value);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!shown.length ? (
        <div className={styles.empty}>No courses here.</div>
      ) : (
        <ol id="memberTopList" className={styles.list} aria-label={title}>
          {shown.map((row) => (
            <CourseRow
              key={row.course.id}
              course={row.course}
              rank={row.rank}
              current={list}
              played={memberPlayed.has(row.course.id)}
              marks={marks(row.course)}
              actions={
                <CourseActions
                  course={row.course}
                  wanted={wanted.has(row.course.id)}
                  signedIn
                  onLog={setLogging}
                  notify={notify}
                  openAuth={openAuth}
                />
              }
            />
          ))}
        </ol>
      )}

      {history && (
        <RoundHistory
          key={history.id}
          course={history}
          notify={notify}
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
      {logging && (
        <LogRoundDialog
          signedIn
          initial={logging}
          played={viewer.played}
          notify={notify}
          onSignIn={openAuth}
          onClose={() => {
            setLogging(null);
          }}
        />
      )}
    </section>
  );
}
