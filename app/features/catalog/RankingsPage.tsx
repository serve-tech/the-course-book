import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { RankingFilter, type RankedCourse } from "./course";
import { selectRankings } from "./ranking-selectors";
import { stateName } from "./geography";
import { StateSelect } from "../../shared/ui/StateSelect";

/** The journal action's reply shape as seen by fetchers. */
interface JournalReply {
  ok?: boolean;
  message?: string;
  error?: string;
}

/**
 * Published rankings with the member's progress. Data arrives from the
 * route loader; "Add to my list" posts the `top` intent to the journal
 * action and the route revalidates.
 */
export function RankingsPage({
  rows,
  played,
  onList,
  signedIn,
  selectedState,
  onState,
  notify,
  onSearchFocus,
  openAuth,
}: {
  rows: readonly RankedCourse[];
  played: Readonly<Record<string, number>>;
  onList: readonly string[];
  signedIn: boolean;
  selectedState: string;
  onState: (value: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  openAuth: () => void;
}) {
  const fetcher = useFetcher<JournalReply>();
  const [filter, setFilter] = useState(RankingFilter.State),
    [query, setQuery] = useState(""),
    [mine, setMine] = useState(false);
  const listed = new Set(onList);
  const adding =
    fetcher.state !== "idle" ? fetcher.formData?.get("courseId") : null;
  const result = selectRankings(rows, filter, selectedState, query, mine, played);
  const noState = filter === RankingFilter.State && !selectedState;
  const label =
    filter === RankingFilter.State
      ? selectedState
        ? stateName(selectedState)
        : "Best in State"
      : (filter === RankingFilter.World
          ? "World"
          : filter === RankingFilter.USA
            ? "USA - All"
            : "USA - Public") + " Top 100";

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    notify(fetcher.data.error ?? fetcher.data.message ?? "Done");
  }, [fetcher.state, fetcher.data, notify]);

  const add = (id: string) => {
    if (!signedIn) {
      notify("Sign in to add courses");
      openAuth();
      return;
    }
    if (adding) return;
    void fetcher.submit(
      { intent: "top", courseId: id },
      { method: "post", action: "/journal" },
    );
  };

  return (
    <section id="top" className="page active">
      <div className="hero">
        <div className="copy">
          <div className="eyebrow">The great courses</div>
          <h1>Your Top 100 journey.</h1>
          <p>
            Track the world's, America's and the best courses in every state.
            See how many you've played and keep building your golf resume.
          </p>
        </div>
        <div className="card">
          <div className="statlabel">{label}</div>
          <div className="stat">
            <strong id="num">
              {noState
                ? "0"
                : String(result.played) + " / " + String(result.total)}
            </strong>
            <span id="totalLabel">
              {noState ? "courses" : "/ " + String(result.total) + " played"}
            </span>
          </div>
          <div className="bar">
            <div
              className="fill"
              id="fill"
              style={{
                width:
                  String(
                    result.total ? (100 * result.played) / result.total : 0,
                  ) + "%",
              }}
            />
          </div>
          <div className="statfoot">
            <span id="remain">
              {noState
                ? "Select a state"
                : String(result.total - result.played) + " remaining"}
            </span>
            <span>Keep playing.</span>
          </div>
        </div>
      </div>
      <div className="controls top100-controls">
        <div className="state-selector-row">
          <StateSelect
            id="topStateRankSelect"
            className="top-state-select"
            value={selectedState}
            onChange={onState}
          />
        </div>
        <div className="seg" id="topseg">
          {(
            [
              [RankingFilter.World, "World"],
              [RankingFilter.USA, "USA - All"],
              [RankingFilter.Public, "USA - Public"],
              [RankingFilter.State, stateName(selectedState)],
            ] as const
          ).map(([value, text]) => (
            <button
              key={value}
              className={value === filter ? "active" : ""}
              data-f={value}
              onClick={() => {
                setFilter(value);
                setQuery("");
                onSearchFocus(false);
              }}
            >
              {value === RankingFilter.State ? (
                <span id="stateTopTabLabel">{text}</span>
              ) : (
                text
              )}
            </button>
          ))}
        </div>
        <div className="top-controls-right">
          <button
            id="topMineToggle"
            className={"top-mine-toggle" + (mine ? " active" : "")}
            aria-pressed={mine}
            onClick={() => {
              setMine(!mine);
              setQuery("");
            }}
          >
            {mine ? "Show all" : "Show mine"}
          </button>
          <div className="search">
            <span>⌕</span>
            <input
              id="topsearch"
              onKeyDown={(event) => {
                if (event.key === "Escape") event.currentTarget.blur();
              }}
              placeholder="Search courses..."
              value={query}
              onFocus={() => {
                onSearchFocus(true);
              }}
              onBlur={() => {
                onSearchFocus(false);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
              }}
            />
          </div>
        </div>
      </div>
      <div className="label">Top courses</div>
      <div className="list" id="toplist">
        {noState ? (
          <div className="empty">
            Select a state to view its Best in State rankings.
          </div>
        ) : !result.complete ? (
          <div className="empty">Rankings for this list are incomplete.</div>
        ) : (
          result.rows.map(({ course, rank }) => {
            const listedHere = listed.has(course.id);
            return (
              <div
                className={
                  "row top-course-row" +
                  ((played[course.id] ?? 0) > 0 ? " played-row" : "")
                }
                key={course.id}
                data-course-id={course.id}
              >
                <div className="rank">#{rank}</div>
                <div>
                  <div className="course">{course.name}</div>
                  <div className="loc">{course.location}</div>
                </div>
                <div>
                  <button
                    className="top-list-action"
                    disabled={listedHere || adding === course.id}
                    onClick={() => {
                      add(course.id);
                    }}
                  >
                    {listedHere
                      ? "On my list"
                      : adding === course.id
                        ? "Adding…"
                        : "Add to my list"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
