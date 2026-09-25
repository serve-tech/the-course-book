import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { RegionFilter, type Course } from "@coursebook/domain/catalog/course";
import { matchesRegion, stateName } from "@coursebook/domain/catalog/geography";
import { StateSelect } from "../../shared/ui/StateSelect";
import { CourseDetails } from "./CourseDetails";
import { RoundHistory } from "../rounds/RoundHistory";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { AddCourseDialog } from "../rounds/AddCourseDialog";
import { CountEditor } from "./CountEditor";
import { useCourseDrag } from "./use-course-drag";
import { reorder } from "@coursebook/domain/journal/reorder";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { replyMessage, useJournalFetcher } from "./use-journal-fetcher";

enum Dialog {
  Log = "log",
  Add = "add",
}

/**
 * My List: the member's personal ranking. Rows come from the route loader in
 * rank order. Drag or the details dialog post `move`; while a move is
 * pending the list is reordered optimistically from the full order, and the
 * loader's revalidation replaces it. Geographic filters are read-only.
 */
export function JournalPage({
  rows,
  signedIn,
  selectedState,
  onState,
  notify,
  onSearchFocus,
  openAuth,
}: {
  rows: readonly ListEntry[];
  signedIn: boolean;
  selectedState: string;
  onState: (value: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  openAuth: () => void;
}) {
  const [query, setQuery] = useState(""),
    [selectedFilter, setFilter] = useState(RegionFilter.All),
    [details, setDetails] = useState<Course | null>(null),
    [history, setHistory] = useState<Course | null>(null),
    [editing, setEditing] = useState<string | null>(null),
    [dialog, setDialog] = useState<Dialog | null>(null);
  const move = useJournalFetcher((reply) => {
    notify(reply.error ? replyMessage(reply) : "Ranking updated");
  });

  const filter =
    selectedFilter === RegionFilter.State && !selectedState
      ? RegionFilter.All
      : selectedFilter;
  const viewOnly = filter !== RegionFilter.All;

  const byId = new Map(rows.map((row) => [row.course.id, row]));
  const played = Object.fromEntries(rows.map((row) => [row.course.id, row.played]));
  const loaderOrder = rows.map((row) => row.course.id);
  const pendingMove = move.busy ? move.fetcher.formData : null;
  const movingId = pendingMove?.get("courseId");
  const movingRank = pendingMove?.get("rank");
  const order =
    pendingMove?.get("intent") === "move" &&
    typeof movingId === "string" &&
    typeof movingRank === "string"
      ? reorder(loaderOrder, movingId, Number(movingRank))
      : loaderOrder;
  const courses = order.flatMap((id, index) => {
    const row = byId.get(id);
    return row ? [{ ...row, rank: index + 1 }] : [];
  });

  const search = query.toLowerCase();
  const visible = courses.filter(
    ({ course }) =>
      matchesRegion(course, filter, selectedState) &&
      (course.name.toLowerCase().includes(search) ||
        course.location.toLowerCase().includes(search)),
  );

  const { drag, start, suppressClick } = useCourseDrag(
    !viewOnly && !move.busy,
    (id, target, after) => {
      const without = order.filter((value) => value !== id),
        targetIndex = without.indexOf(target);
      if (targetIndex < 0) return;
      move.submit({
        intent: "move",
        courseId: id,
        rank: String(targetIndex + (after ? 2 : 1)),
      });
    },
  );

  const labels: readonly [RegionFilter, string][] = [
    [RegionFilter.All, "All"],
    [RegionFilter.World, "World"],
    [RegionFilter.USA, "US"],
    [RegionFilter.State, stateName(selectedState)],
  ];
  const dragged = drag?.active ? byId.get(drag.id) : undefined;

  return (
    <section id="mine" className="page active">
      <div className="listhead">
        <div>
          <div className="eyebrow">Your courses</div>
          <h2>My List</h2>
          <p>Press and drag a course to change your ranking.</p>
          <div className="course-count" aria-live="polite">
            <strong id="myCourseCount">{courses.length}</strong>
            <span>courses</span>
          </div>
        </div>
        <button
          className="primary"
          id="log"
          onClick={() => {
            setDialog(Dialog.Log);
          }}
        >
          + Log a Round
        </button>
      </div>
      <div className="controls mine-controls">
        <div className="state-selector-row">
          <StateSelect
            id="myListStateSelect"
            className="mylist-state-select"
            value={selectedState}
            onChange={onState}
          />
        </div>
        <div
          className="seg mylist-filter"
          id="mylistFilter"
          role="tablist"
          aria-label="My List region filter"
        >
          {labels.map(([value, label]) => (
            <button
              key={value}
              className={filter === value ? "active" : ""}
              data-myfilter={value}
              onClick={() => {
                setFilter(value);
                onSearchFocus(false);
              }}
            >
              {value === RegionFilter.State ? (
                <span id="stateMyListTabLabel">{label}</span>
              ) : (
                label
              )}
            </button>
          ))}
        </div>
        <div className="search">
          <span>⌕</span>
          <input
            id="mysearch"
            onKeyDown={(event) => {
              if (event.key === "Escape") event.currentTarget.blur();
            }}
            placeholder="Search my courses..."
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onFocus={() => {
              onSearchFocus(true);
            }}
            onBlur={() => {
              onSearchFocus(false);
            }}
          />
        </div>
      </div>
      <div className="label">Personal ranking</div>
      <div className={"list" + (viewOnly ? " mylist-view-only" : "")} id="mylist">
        {!visible.length ? (
          <div className="empty">
            <h3>Your list is empty.</h3>
            {signedIn
              ? "Log your first round to start ranking courses."
              : "Sign in and log your first round to start ranking courses."}
          </div>
        ) : (
          visible.map(({ course, rank, played: count }) => (
            <Fragment key={course.id}>
              {drag?.active && drag.target === course.id && !drag.after && (
                <div className="rankrow drag-placeholder" aria-hidden="true" />
              )}
              <div
                className={
                  "rankrow played-row" +
                  (viewOnly ? " mylist-view-only" : "") +
                  (drag?.active && drag.target === course.id ? " over" : "")
                }
                data-id={course.id}
                style={drag?.active && drag.id === course.id ? { opacity: 0 } : undefined}
                aria-disabled={viewOnly}
                onPointerDown={(event) => {
                  start(event, course.id);
                }}
                onClick={(event) => {
                  if (
                    !viewOnly &&
                    !suppressClick.current &&
                    event.target instanceof Element &&
                    !event.target.closest("button,input,a,.handle")
                  )
                    setDetails(course);
                }}
              >
                <div
                  className="handle"
                  style={{ visibility: viewOnly ? "hidden" : "visible", touchAction: "none" }}
                >
                  ⋮⋮
                </div>
                <div className="myrank">{rank}</div>
                <div>
                  <div className="course">{course.name}</div>
                  <div className="loc">{course.location}</div>
                </div>
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
                  <div className="count">
                    <button
                      className="roundslink"
                      aria-label="View rounds"
                      disabled={viewOnly}
                      onClick={() => {
                        setHistory(course);
                      }}
                    >
                      <strong>{count}×</strong>
                      <span> played</span>
                    </button>
                  </div>
                )}
              </div>
              {drag?.active && drag.target === course.id && drag.after && (
                <div className="rankrow drag-placeholder" aria-hidden="true" />
              )}
            </Fragment>
          ))
        )}
      </div>
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
          signedIn={signedIn}
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
            className="rankrow drag-ghost"
            style={{
              position: "fixed",
              pointerEvents: "none",
              left: drag.x - 30,
              top: drag.y - 24,
              width: drag.width,
              zIndex: 10000,
            }}
          >
            <div className="handle">⋮⋮</div>
            <div className="myrank">{order.indexOf(drag.id) + 1}</div>
            <div>
              <div className="course">{dragged.course.name}</div>
              <div className="loc">{dragged.course.location}</div>
            </div>
            <div className="count">
              <strong>{dragged.played}×</strong>
              <span> played</span>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
