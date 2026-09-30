import { useState } from "react";
import type { Course, RankedCourse } from "@coursebook/domain/catalog/course";
import { stateName } from "@coursebook/domain/catalog/geography";
import { topListTitle } from "@coursebook/domain/social/top-lists";
import type { ViewerCourses } from "../../lib/api/viewer";
import { usePreference } from "../../shared/lib/use-preference";
import { StateSelect } from "../../shared/ui/StateSelect";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { CourseActions } from "./CourseActions";
import { CourseRow } from "./CourseRow";
import { filterEntries, homeState, listEntries, ListTab, parseListTab, PlayedFilter, playedCount, tabList } from "./lists";
import styles from "./top-lists.module.css";

/** Browser preference: the Courses tab last shown on this device. */
const TAB_PREFERENCE = "coursebookTopListTab";

const TAB_LABELS: Readonly<Record<ListTab, string>> = {
  [ListTab.USA]: "USA Top 100",
  [ListTab.Public]: "USA Public",
  [ListTab.World]: "World",
  [ListTab.State]: "Best in State",
};

/**
 * The Courses page: the published Top lists as checklists. It opens on the
 * tab last used on this device (the USA Top 100 the first time). Best in
 * State shows the chosen state, else the state where the viewer has played
 * most. Rows carry every rank a course holds, a tick when the viewer played
 * it, and Log a round and Want to play buttons.
 *
 * @param rows - Every published ranking entry.
 * @param viewer - The signed-in viewer's courses and Want to play list; null when signed out.
 * @param selectedState - The state chosen on this device ("" when none).
 */
export function TopListsPage({
  rows,
  viewer,
  selectedState,
  onState,
  notify,
  onSearchFocus,
  openAuth,
}: {
  rows: readonly RankedCourse[];
  viewer: ViewerCourses | null;
  selectedState: string;
  onState: (code: string) => void;
  notify: (message: string) => void;
  onSearchFocus: (focused: boolean) => void;
  openAuth: () => void;
}) {
  const [storedTab, setStoredTab] = usePreference(TAB_PREFERENCE);
  const [filter, setFilter] = useState(PlayedFilter.All);
  const [query, setQuery] = useState("");
  const [logging, setLogging] = useState<Course | null>(null);

  const tab = parseListTab(storedTab);
  const state = selectedState || homeState(viewer?.courses ?? []);
  const list = tabList(tab, state);
  const played = new Set(Object.entries(viewer?.played ?? {}).flatMap(([id, rounds]) => (rounds > 0 ? [id] : [])));
  const wanted = new Set(viewer?.wanted ?? []);
  const { entries, complete } = list ? listEntries(rows, list) : { entries: [], complete: false };
  const shown = filterEntries(entries, { filter, played, query });
  const done = playedCount(entries, played);
  const title = list ? topListTitle(list.type, list.scope) : "Best in State";

  const filters: readonly [PlayedFilter, string][] = [
    [PlayedFilter.All, "All " + String(entries.length)],
    [PlayedFilter.Played, "Played " + String(done)],
    [PlayedFilter.NotPlayed, "Not played " + String(entries.length - done)],
  ];

  return (
    <section className={styles.page} aria-labelledby="topListsTitle">
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>The great courses</div>
          <h1 id="topListsTitle" className={styles.title}>
            Top lists
          </h1>
          <p className={styles.lede}>Work through the published lists: tick off what you've played and save what you want to play next.</p>
        </div>
        {list && complete && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>{title}</div>
            <div className={styles.progressLine}>
              <span>
                <b>{viewer ? done : entries.length}</b>
                <small>{viewer ? "/ " + String(entries.length) + " played" : "courses"}</small>
              </span>
              {viewer && <span>{String(entries.length - done)} to go</span>}
            </div>
            {viewer && (
              <div className={styles.bar} role="progressbar" aria-label={title + " played"} aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={done}>
                <span style={{ width: String(entries.length ? (100 * done) / entries.length : 0) + "%" }} />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Top lists">
        {Object.values(ListTab).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={value === tab}
            onClick={() => {
              setStoredTab(value);
              setFilter(PlayedFilter.All);
              setQuery("");
            }}
          >
            {value === ListTab.State && state ? "Best in " + stateName(state) : TAB_LABELS[value]}
          </button>
        ))}
      </div>
      {tab === ListTab.World && (
        <p className={styles.caption}>Golf Digest's world list covers courses outside the United States; American courses are on the USA lists.</p>
      )}

      <div className={styles.toolbar}>
        {tab === ListTab.State && (
          <span className={styles.stateSelect}>
            <StateSelect id="topStateRankSelect" value={state} onChange={onState} label="State for Best in State" />
          </span>
        )}
        {viewer && (
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
        )}
        <div className={styles.search}>
          <input
            id="topsearch"
            type="search"
            aria-label="Search this list"
            placeholder="Search this list…"
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

      {!list ? (
        <div className={styles.empty}>Pick a state to see its Best in State list.</div>
      ) : !complete ? (
        <div className={styles.empty}>Rankings for this list are incomplete.</div>
      ) : !shown.length ? (
        <div className={styles.empty}>No courses here match.</div>
      ) : (
        <ol id="toplist" className={styles.list} aria-label={title}>
          {shown.map((row) => {
            const rounds = viewer?.played[row.course.id] ?? 0;
            return (
              <CourseRow
                key={row.course.id}
                course={row.course}
                rank={row.rank}
                current={list}
                played={rounds > 0}
                marks={rounds > 0 ? [{ label: "Played", you: false }] : []}
                note={rounds > 1 ? String(rounds) + " rounds" : undefined}
                actions={
                  <CourseActions
                    course={row.course}
                    wanted={wanted.has(row.course.id)}
                    signedIn={viewer !== null}
                    onLog={setLogging}
                    notify={notify}
                    openAuth={openAuth}
                  />
                }
              />
            );
          })}
        </ol>
      )}

      {logging && viewer && (
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
