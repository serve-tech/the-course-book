import { Fragment, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { reorder } from "@coursebook/domain/journal/reorder";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { cx } from "../../shared/lib/cx";
import { AddCourseDialog } from "../rounds/AddCourseDialog";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { RoundHistory } from "../rounds/RoundHistory";
import { CourseSummary, PlayedMarks, type PlayedMark } from "../top-lists/CourseRow";
import styles from "../top-lists/top-lists.module.css";
import { CountEditor } from "./CountEditor";
import { CourseDetails } from "./CourseDetails";
import { coursesLabel, rankingRows, roundsLabel } from "./ranking";
import { RankingFilters } from "./RankingFilters";
import { useCourseDrag } from "./use-course-drag";
import { replyMessage, useJournalFetcher } from "./use-journal-fetcher";

enum Dialog {
  Log = "log",
  Add = "add",
}

/**
 * The member's own Ranking, laid out like the Courses page. Rows come from
 * the route loader in rank order. Drag or the details dialog post `move`;
 * while a move is pending the list is reordered optimistically from the
 * full order, and the loader's revalidation replaces it.
 *
 * The region tabs (USA, International, Best in State) are read-only: ranks
 * there are overall ranks, and a drop would land among courses the tab
 * hides. Search keeps editing, because a move renumbers the full list.
 *
 * It is the Ranking tab of the member's own profile, whose header holds
 * Log a round; `openLog` opens the Log dialog when it turns true (the Log a
 * round buttons link to `?log=1`).
 *
 * @param rows - The member's ranking in rank order.
 * @param openLog - Opens the Log dialog each time it turns true.
 * @param selectedState - The state for Best in State, shared with the Courses page.
 * @param onState - Chooses that state.
 */
export function MyRanking({
  rows,
  openLog = false,
  selectedState,
  onState,
  notify,
  onSearchFocus,
  openAuth,
}: {
  rows: readonly ListEntry[];
  openLog?: boolean;
  selectedState: string;
  onState: (value: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  openAuth: () => void;
}) {
  const [query, setQuery] = useState(""),
    [region, setRegion] = useState(RegionFilter.All),
    [details, setDetails] = useState<Course | null>(null),
    [history, setHistory] = useState<Course | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(openLog ? Dialog.Log : null),
    [logRequested, setLogRequested] = useState(openLog);
  // Open the Log dialog each time `openLog` turns true, adjusting state
  // during render rather than in an effect (react.dev, "You Might Not Need an Effect").
  if (openLog !== logRequested) {
    setLogRequested(openLog);
    if (openLog) setDialog(Dialog.Log);
  }
  const move = useJournalFetcher((reply) => {
    notify(reply.error ? replyMessage(reply) : "Ranking updated");
  });

  const readOnly = region !== RegionFilter.All;
  const byId = new Map(rows.map((row) => [row.course.id, row]));
  const played = Object.fromEntries(rows.map((row) => [row.course.id, row.played]));
  const loaderOrder = rows.map((row) => row.course.id);
  const pendingMove = move.busy ? move.fetcher.formData : null;
  const movingId = pendingMove?.get("courseId");
  const movingRank = pendingMove?.get("rank");
  const order =
    pendingMove?.get("intent") === "move" && typeof movingId === "string" && typeof movingRank === "string"
      ? reorder(loaderOrder, movingId, Number(movingRank))
      : loaderOrder;
  const courses = order.flatMap((id, index) => {
    const row = byId.get(id);
    return row ? [{ ...row, rank: index + 1 }] : [];
  });
  const inRegion = rankingRows(courses, { region, state: selectedState, query: "" });
  const visible = rankingRows(courses, { region, state: selectedState, query });
  const stateMissing = region === RegionFilter.State && !selectedState;

  const { drag, start, suppressClick } = useCourseDrag(!readOnly && !move.busy, (id, target, after) => {
    const without = order.filter((value) => value !== id),
      targetIndex = without.indexOf(target);
    if (targetIndex < 0) return;
    move.submit({ intent: "move", courseId: id, rank: String(targetIndex + (after ? 2 : 1)) });
  });
  const dragged = drag?.active ? byId.get(drag.id) : undefined;

  const marks = (course: Course, count: number): PlayedMark[] => {
    const label = roundsLabel(count);
    if (readOnly) return [{ label, you: false }];
    return [
      {
        label,
        you: false,
        onClick: () => {
          setHistory(course);
        },
      },
    ];
  };

  return (
    <section className={styles.page} aria-label="Your ranking">
      <RankingFilters
        region={region}
        state={selectedState}
        query={query}
        onRegion={(value) => {
          setRegion(value);
          onSearchFocus(false);
        }}
        onState={onState}
        onQuery={setQuery}
        onSearchFocus={onSearchFocus}
      />
      {courses.length > 0 && !stateMissing && (
        <p className={styles.caption} aria-live="polite">
          <span id="rankingCount">{coursesLabel(inRegion.length)}</span>
          {" · "}
          {readOnly ? "Your overall ranks. Reorder from All." : "Drag a course to change your ranking."}
        </p>
      )}

      {!courses.length ? (
        <div className={styles.empty}>Your ranking is empty. Log your first round to start ranking courses.</div>
      ) : stateMissing ? (
        <div className={styles.empty}>Pick a state to see the courses you've played there.</div>
      ) : !visible.length ? (
        <div className={styles.empty}>No courses here match.</div>
      ) : (
        <ol id="ranking" className={styles.list} aria-label="Ranking">
          {visible.map(({ course, rank, played: count }) => {
            const over = drag?.active === true && drag.target === course.id;
            const slot = <li className={styles.dropSlot} aria-hidden="true" />;
            return (
              <Fragment key={course.id}>
                {over && !drag.after && slot}
                <li
                  className={cx(styles.row, styles.rankRow, over && styles.over, drag?.active && drag.id === course.id && styles.lifted)}
                  data-course={course.name}
                  data-drag-id={course.id}
                  aria-disabled={readOnly}
                  onPointerDown={(event) => {
                    start(event, course.id);
                  }}
                  onClick={(event) => {
                    if (
                      !readOnly &&
                      !suppressClick.current &&
                      event.target instanceof Element &&
                      !event.target.closest("button,input,a,[data-drag-handle]")
                    )
                      setDetails(course);
                  }}
                >
                  <RankedCells course={course} rank={rank}>
                    {editing === course.id ? (
                      <CountEditor
                        course={course}
                        count={count}
                        onClose={() => {
                          setEditing(null);
                        }}
                        notify={notify}
                      />
                    ) : (
                      <PlayedMarks course={course} marks={marks(course, count)} />
                    )}
                  </RankedCells>
                </li>
                {over && drag.after && slot}
              </Fragment>
            );
          })}
        </ol>
      )}

      {details && (
        <CourseDetails
          key={details.id}
          course={details}
          rank={order.indexOf(details.id) + 1}
          played={played[details.id] ?? 0}
          onClose={() => {
            setDetails(null);
          }}
          onHistory={() => {
            setHistory(details);
            setDetails(null);
          }}
          onEditCount={() => {
            setEditing(details.id);
            setDetails(null);
          }}
          notify={notify}
        />
      )}
      {history && (
        <RoundHistory
          key={history.id}
          course={history}
          onClose={() => {
            setHistory(null);
          }}
          notify={notify}
        />
      )}
      {dialog === Dialog.Log && (
        <LogRoundDialog
          signedIn
          played={played}
          onClose={() => {
            setDialog(null);
          }}
          onAdd={() => {
            setDialog(Dialog.Add);
          }}
          onSignIn={() => {
            setDialog(null);
            openAuth();
          }}
          notify={notify}
        />
      )}
      {dialog === Dialog.Add && (
        <AddCourseDialog
          onClose={() => {
            setDialog(null);
          }}
          notify={notify}
        />
      )}
      {drag?.active &&
        dragged &&
        createPortal(
          <div
            className={cx(styles.row, styles.rankRow, styles.ghost)}
            data-drag-ghost
            style={{ left: drag.x - 30, top: drag.y - 24, width: drag.width }}
          >
            <RankedCells course={dragged.course} rank={order.indexOf(drag.id) + 1}>
              <PlayedMarks course={dragged.course} marks={[{ label: roundsLabel(dragged.played), you: false }]} />
            </RankedCells>
          </div>,
          document.body,
        )}
    </section>
  );
}

/**
 * A ranking row's cells: the drag handle, the rank, the course, then
 * `children` (the play count, or its editor). The row and the copy that
 * follows the pointer during a drag both use it, so they match.
 */
function RankedCells({ course, rank, children }: { course: Course; rank: number; children: ReactNode }) {
  return (
    <>
      <span className={styles.handle} data-drag-handle aria-hidden="true">
        ⋮⋮
      </span>
      <span className={styles.rank}>{rank}</span>
      <CourseSummary course={course} current={null} />
      {children}
    </>
  );
}
