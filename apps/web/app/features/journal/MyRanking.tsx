import { Fragment, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { reorder } from "@coursebook/domain/journal/reorder";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { cx } from "../../shared/lib/cx";
import { PageHeader } from "../../shared/ui/PageHeader";
import { RoundHistory } from "../rounds/RoundHistory";
import type { RankingImageContent } from "../share/ranking-image";
import { viewRows, type ShareView } from "@coursebook/domain/sharing/view";
import { TopChoices, ViewHeader } from "../share/ViewHeader";
import { CourseSummary, PlayedMarks, type PlayedMark } from "../top-lists/CourseRow";
import styles from "../top-lists/top-lists.module.css";
import { CountEditor } from "./CountEditor";
import { CourseDetails } from "./CourseDetails";
import { coursesLabel, RankingLayout, rankingRows, roundsLabel } from "./ranking";
import { RankingCards } from "./RankingCards";
import toolbarStyles from "./ranking-toolbar.module.css";
import { RankingFilters } from "./RankingFilters";
import { useCourseDrag } from "./use-course-drag";
import { replyMessage, useJournalFetcher } from "./use-journal-fetcher";

/** A page header for the ranking, when it is the whole page. */
export interface RankingHeading {
  eyebrow: string;
  title: string;
  lede: string;
  /** Anything else under the subtitle, such as a button. */
  children?: ReactNode;
}

/**
 * The member's own Ranking, laid out like the Courses page. Rows come from
 * the route loader in rank order. Drag or the details dialog post `move`;
 * while a move is pending the list is reordered optimistically from the
 * full order, and the loader's revalidation replaces it.
 *
 * The region tabs (USA, International, Best in State) number courses within
 * the tab, as the shared link and image do, and are read-only until a drop
 * can place a course among the ones the tab hides (#55). Search keeps editing,
 * because a move renumbers the full list. All cut to a Top N also keeps
 * editing, because its numbers are the overall ones.
 *
 * @param rows - The member's ranking in rank order.
 * @param username - The member, for the link to their public ranking.
 * @param name - The member's name, which the saved image shows.
 * @param onLog - Opens the Log a round dialog over the page (the empty ranking's Log your first round).
 * @param selectedState - The state for Best in State, shared with the Courses page.
 * @param onState - Chooses that state.
 * @param initialTop - The Top N the page opens on; null opens on every course.
 * @param searchFrom - Views with this many courses or fewer offer no search. Defaults to always offering it.
 * @param heading - The page's header, when this is the page rather than a tab: the view's title and share buttons become its panel.
 * @param showRounds - Whether each row shows its round count. Defaults to true.
 * @param initialLayout - Photo cards or the compact Reorder rows. Defaults to cards; only Reorder drags.
 * @param renderImage - Draws the saved image; for tests, because jsdom has no canvas.
 */
export function MyRanking({
  rows,
  username,
  name,
  onLog,
  selectedState,
  onState,
  notify,
  onSearchFocus,
  initialTop = null,
  searchFrom = 0,
  heading,
  showRounds = true,
  initialLayout = RankingLayout.Cards,
  renderImage,
}: {
  rows: readonly ListEntry[];
  username: string;
  name: string;
  onLog: () => void;
  selectedState: string;
  onState: (value: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  initialTop?: number | null;
  searchFrom?: number;
  heading?: RankingHeading | undefined;
  showRounds?: boolean;
  initialLayout?: RankingLayout;
  renderImage?: (content: RankingImageContent) => Promise<Blob>;
}) {
  const [layout, setLayout] = useState(initialLayout);
  const reordering = layout === RankingLayout.Reorder;
  const [query, setQuery] = useState(""),
    [region, setRegion] = useState(RegionFilter.All),
    [top, setTop] = useState(initialTop),
    [details, setDetails] = useState<Course | null>(null),
    [history, setHistory] = useState<Course | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const move = useJournalFetcher((reply) => {
    notify(reply.error ? replyMessage(reply) : "Ranking updated");
  });

  const readOnly = region !== RegionFilter.All;
  const byId = useMemo(() => new Map(rows.map((row) => [row.course.id, row])), [rows]);
  const played = Object.fromEntries(rows.map((row) => [row.course.id, row.played]));
  const pendingMove = move.busy && move.fetcher.formData?.get("intent") === "move" ? move.fetcher.formData : null;
  const movingId = pendingMove?.get("courseId");
  const movingRank = pendingMove?.get("rank");
  const order = useMemo(() => {
    const ids = rows.map((row) => row.course.id);
    return typeof movingId === "string" && typeof movingRank === "string" ? reorder(ids, movingId, Number(movingRank)) : ids;
  }, [rows, movingId, movingRank]);
  const courses = useMemo(
    () =>
      order.flatMap((id, index) => {
        const row = byId.get(id);
        return row ? [{ ...row, rank: index + 1 }] : [];
      }),
    [order, byId],
  );
  const shown = useMemo<ShareView>(
    () => ({ region, state: region === RegionFilter.State ? selectedState : "", top }),
    [region, selectedState, top],
  );
  const viewed = useMemo(() => viewRows(courses, shown), [courses, shown]);
  const searchable = viewed.length > searchFrom;
  const visible = rankingRows(viewed, { region: RegionFilter.All, state: "", query: searchable ? query : "" });
  const stateMissing = region === RegionFilter.State && !selectedState;

  const { drag, start, suppressClick } = useCourseDrag(reordering && !readOnly && !move.busy, (id, target, after) => {
    const without = order.filter((value) => value !== id),
      targetIndex = without.indexOf(target);
    if (targetIndex < 0) return;
    move.submit({ intent: "move", courseId: id, rank: String(targetIndex + (after ? 2 : 1)) });
  });
  const dragged = drag?.active ? byId.get(drag.id) : undefined;

  const marks = (course: Course, count: number): PlayedMark[] => {
    if (!showRounds) return [];
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

  const viewHeader = (panel: boolean) =>
    courses.length > 0 && !stateMissing ? (
      <ViewHeader username={username} memberName={name} view={shown} rows={viewed} notify={notify} panel={panel} render={renderImage}>
        <span id="rankingCount">{coursesLabel(viewed.length)}</span>
      </ViewHeader>
    ) : null;

  return (
    <section className={styles.page} aria-label="Your ranking">
      {heading && (
        <PageHeader eyebrow={heading.eyebrow} title={heading.title} lede={heading.lede} aside={viewHeader(true)}>
          {heading.children}
        </PageHeader>
      )}
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
        searchable={searchable}
      >
        {courses.length > 0 && <TopChoices top={top} onTop={setTop} />}
      </RankingFilters>
      {!heading && viewHeader(false)}
      {courses.length > 0 && !stateMissing && (
        <div className={toolbarStyles.toolbar}>
          {reordering && (
            <p className={styles.hint}>{readOnly ? "Switch to All to reorder." : "Drag a course to change your ranking."}</p>
          )}
          {(reordering || !readOnly) && (
            <button
              type="button"
              className={styles.filter}
              aria-pressed={reordering}
              onClick={() => {
                setLayout(reordering ? RankingLayout.Cards : RankingLayout.Reorder);
              }}
            >
              {reordering ? "Done" : "Reorder"}
            </button>
          )}
        </div>
      )}

      {!courses.length ? (
        <div className={styles.empty}>
          <p>Your ranking is empty. Log your first round to start ranking courses.</p>
          <button type="button" className={styles.filter} onClick={onLog}>Log your first round</button>
        </div>
      ) : stateMissing ? (
        <div className={styles.empty}>Pick a state to see the courses you've played there.</div>
      ) : !visible.length ? (
        <div className={styles.empty}>No courses here match.</div>
      ) : !reordering ? (
        <RankingCards rows={visible} />
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
      {drag?.active &&
        dragged &&
        createPortal(
          <div
            className={cx(styles.row, styles.rankRow, styles.ghost)}
            data-drag-ghost
            style={{ left: drag.x - 30, top: drag.y - 24, width: drag.width }}
          >
            <RankedCells course={dragged.course} rank={order.indexOf(drag.id) + 1}>
              <PlayedMarks course={dragged.course} marks={showRounds ? [{ label: roundsLabel(dragged.played), you: false }] : []} />
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
