import { useState } from "react";
import { useJournal, useServices } from "../../app/context";
import { RankingFilter, type RankedCourse } from "./course";
import { selectRankings } from "./ranking-selectors";
import { stateName } from "./geography";
import { StateSelect } from "../../shared/ui/StateSelect";
import { AddRoundMode } from "../rounds/round-service";
import { errorMessage } from "../../shared/lib/errors";
export function RankingsPage({
  active,
  rows,
  selectedState,
  onState,
  notify,
  onSearchFocus,
}: {
  active: boolean;
  rows: readonly RankedCourse[];
  selectedState: string;
  onState: (value: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
}) {
  const { rounds } = useServices(),
    { account, user } = useJournal();
  const [filter, setFilter] = useState(RankingFilter.State),
    [query, setQuery] = useState(""),
    [mine, setMine] = useState(false),
    [adding, setAdding] = useState<string | null>(null);
  const result = selectRankings(
    rows,
    filter,
    selectedState,
    query,
    mine,
    account.played,
  );
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
  const add = async (id: string) => {
    if (!user) {
      notify("Sign in to add courses");
      return;
    }
    const course = rows.find((row) => row.course.id === id)?.course;
    if (!course || adding) return;
    setAdding(id);
    try {
      await rounds.log(course, 1, AddRoundMode.Top);
      notify("Added to My List");
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setAdding(null);
    }
  };
  return (
    <section id="top" className={"page" + (active ? " active" : "")}>
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
          {[
            [RankingFilter.World, "World"],
            [RankingFilter.USA, "USA - All"],
            [RankingFilter.Public, "USA - Public"],
            [RankingFilter.State, stateName(selectedState)],
          ].map(([value, label]) => (
            <button
              key={value}
              className={value === filter ? "active" : ""}
              data-f={value}
              onClick={() => {
                if (
                  value &&
                  Object.values(RankingFilter).includes(value as RankingFilter)
                )
                  setFilter(value as RankingFilter);
                setQuery("");
                onSearchFocus(false);
              }}
            >
              {value === RankingFilter.State ? (
                <span id="stateTopTabLabel">{label}</span>
              ) : (
                label
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
          <div className="empty">Loading rankings…</div>
        ) : (
          result.rows.map(({ course, rank }) => {
            const onList = account.myList.includes(course.id);
            return (
              <div
                className={
                  "row top-course-row" +
                  ((account.played[course.id] ?? 0) > 0 ? " played-row" : "")
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
                    disabled={onList || adding === course.id}
                    onClick={() => {
                      void add(course.id);
                    }}
                  >
                    {onList
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
