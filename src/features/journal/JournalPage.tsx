import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import { useJournal, useServices } from "../../app/context";
import { RegionFilter, type Course } from "../catalog/course";
import { matchesRegion, stateName } from "../catalog/geography";
import { StateSelect } from "../../shared/ui/StateSelect";
import { CourseDetails } from "./CourseDetails";
import { RoundHistory } from "../rounds/RoundHistory";
import { CountEditor } from "./CountEditor";
import { useCourseDrag } from "./use-course-drag";
export function JournalPage({
  active,
  selectedState,
  onState,
  onLog,
  notify,
  onSearchFocus,
}: {
  active: boolean;
  selectedState: string;
  onState: (value: string) => void;
  onLog: () => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
}) {
  const { journal, catalog } = useServices(),
    { account } = useJournal();
  const [query, setQuery] = useState(""),
    [selectedFilter, setFilter] = useState(RegionFilter.All),
    [details, setDetails] = useState<Course | null>(null),
    [history, setHistory] = useState<Course | null>(null),
    [editing, setEditing] = useState<string | null>(null);
  const filter =
    selectedFilter === RegionFilter.State && !selectedState
      ? RegionFilter.All
      : selectedFilter;
  const viewOnly = filter !== RegionFilter.All;
  const courses = account.myList.flatMap((id, index) => {
    const course = catalog.get(id);
    return course ? [{ course, rank: index + 1 }] : [];
  });
  const search = query.toLowerCase();
  const visible = courses.filter(
    ({ course }) =>
      matchesRegion(course, filter, selectedState) &&
      (course.name.toLowerCase().includes(search) ||
        course.location.toLowerCase().includes(search)),
  );
  const { drag, start, suppressClick } = useCourseDrag(
    !viewOnly,
    (id, target, after) => {
      const order = account.myList.filter((value) => value !== id),
        targetIndex = order.indexOf(target);
      if (targetIndex < 0) return;
      void journal.move(id, targetIndex + (after ? 2 : 1)).then(
        () => {
          notify("Ranking updated");
        },
        () => {
          notify("Moved here; cloud update failed");
        },
      );
    },
  );
  const labels: readonly [RegionFilter, string][] = [
    [RegionFilter.All, "All"],
    [RegionFilter.World, "World"],
    [RegionFilter.USA, "US"],
    [RegionFilter.State, stateName(selectedState)],
  ];
  return (
    <section id="mine" className={"page" + (active ? " active" : "")}>
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
        <button className="primary" id="log" onClick={onLog}>
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
      <div
        className={"list" + (viewOnly ? " mylist-view-only" : "")}
        id="mylist"
      >
        {!visible.length ? (
          <div className="empty">
            <h3>Your list is empty.</h3>Log your first round to start ranking
            courses.
          </div>
        ) : (
          visible.map(({ course, rank }) => (
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
                key={course.id}
                data-id={course.id}
                style={
                  drag?.active && drag.id === course.id
                    ? { opacity: 0 }
                    : undefined
                }
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
                  style={{
                    visibility: viewOnly ? "hidden" : "visible",
                    touchAction: "none",
                  }}
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
                    count={account.played[course.id] ?? 0}
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
                      <strong>{account.played[course.id] ?? 0}×</strong>
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
            <div className="myrank">{account.myList.indexOf(drag.id) + 1}</div>
            <div>
              <div className="course">{catalog.get(drag.id)?.name}</div>
              <div className="loc">{catalog.get(drag.id)?.location}</div>
            </div>
            <div className="count">
              <strong>{account.played[drag.id] ?? 0}×</strong>
              <span> played</span>
            </div>
          </div>,
          document.body,
        )}
    </section>
  );
}
