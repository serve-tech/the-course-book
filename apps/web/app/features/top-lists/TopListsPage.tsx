import { useState } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import { stateName } from "@coursebook/domain/catalog/geography";
import { topListTitle } from "@coursebook/domain/social/top-lists";
import type { TopListCourse, TopListStanding } from "@coursebook/domain/social/types";
import type { Notify } from "../../shared/ui/shell";
import { StateSelect } from "../../shared/ui/StateSelect";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { RoundHistory } from "../rounds/RoundHistory";
import { Avatar } from "../social/Avatar";
import { displayName } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import { CourseActions } from "./CourseActions";
import { CourseRow } from "./CourseRow";
import { isCompleteList, ListTab, type TopListRef } from "./lists";
import styles from "./top-lists.module.css";

/** Friends shown on the progress card before "and N more". */
const LEADERS = 3;

const TAB_LABELS: Readonly<Record<ListTab, string>> = {
  [ListTab.World]: "World",
  [ListTab.USA]: "USA Top 100",
  [ListTab.Public]: "USA Public",
  [ListTab.International]: "International",
  [ListTab.State]: "Best in State",
};

/** Where a national list comes from, under its tab. */
const CAPTIONS: Partial<Readonly<Record<ListTab, string>>> = {
  [ListTab.World]: "GOLF Magazine's Top 100 Courses in the World: every country on one list.",
  [ListTab.USA]: "Golf Digest's America's 100 Greatest.",
  [ListTab.Public]: "Golf Digest's 100 Greatest Public courses.",
  [ListTab.International]: "Golf Digest's World 100 Greatest: courses outside the United States.",
};

/** Which courses to show. */
enum Show {
  All = "all",
  Played = "played",
  NotPlayed = "not-played",
}

/**
 * The Courses page: one published Top list as a checklist. The route
 * chooses the list and loads it; this renders the tabs, the viewer's and
 * friends' progress, and the courses. Each row carries every rank the course
 * holds, the viewer's tick (which opens their rounds there), the friends who
 * played it, and Log a round and Want to play buttons.
 *
 * @param tab - The selected tab.
 * @param list - The list shown; null on Best in State before a state is chosen.
 * @param state - The state the State tab shows ("" when none).
 * @param entries - The list's courses in rank order, with the viewer's rounds and friends.
 * @param standing - The viewer's and friends' progress; null when signed out.
 * @param onChoose - Shows another tab (with `state` for Best in State).
 * @param onState - Chooses the state for Best in State.
 */
export function TopListsPage({
  tab,
  list,
  state,
  entries,
  standing,
  signedIn,
  onChoose,
  onState,
  notify,
  onSearchFocus,
  openAuth,
}: {
  tab: ListTab;
  list: TopListRef | null;
  state: string;
  entries: readonly TopListCourse[];
  standing: TopListStanding | null;
  signedIn: boolean;
  onChoose: (tab: ListTab, state: string) => void;
  onState: (code: string) => void;
  notify: Notify;
  onSearchFocus: (focused: boolean) => void;
  openAuth: () => void;
}) {
  const [show, setShow] = useState(Show.All);
  const [query, setQuery] = useState("");
  const [logging, setLogging] = useState<Course | null>(null);
  const [history, setHistory] = useState<Course | null>(null);

  const complete = list !== null && isCompleteList(list, entries.map((entry) => entry.rank));
  const title = list ? topListTitle(list.type, list.scope) : "Best in State";
  const done = entries.filter((entry) => entry.played > 0).length;
  const search = query.trim().toLowerCase();
  const shown = entries.filter(
    (entry) =>
      (show === Show.All || (show === Show.Played) === entry.played > 0) &&
      (!search || (entry.course.name + " " + entry.course.location).toLowerCase().includes(search)),
  );
  const played = Object.fromEntries(entries.map((entry) => [entry.course.id, entry.played]));
  const filters: readonly [Show, string][] = [
    [Show.All, "All " + String(entries.length)],
    [Show.Played, "Played " + String(done)],
    [Show.NotPlayed, "Not played " + String(entries.length - done)],
  ];
  const others = standing ? standing.friends.length - LEADERS : 0;

  return (
    <section className={styles.page} aria-labelledby="topListsTitle">
      <div className={styles.head}>
        <div>
          <div className={styles.eyebrow}>The great courses</div>
          <h1 id="topListsTitle" className={styles.title}>
            Top lists
          </h1>
          <p className={styles.lede}>
            Work through the published lists: tick off what you've played, save what you want to play next, and see how your friends are doing.
          </p>
        </div>
        {list && complete && (
          <div className={styles.progress}>
            <div className={styles.progressLabel}>{title}</div>
            <div className={styles.progressLine}>
              <span>
                <b>{standing ? standing.mine : entries.length}</b>
                <small>{standing ? "/ " + String(entries.length) + " played" : "courses"}</small>
              </span>
              {standing && <span>{String(entries.length - standing.mine)} to go</span>}
            </div>
            {standing && (
              <div className={styles.bar} role="progressbar" aria-label={title + " played"} aria-valuemin={0} aria-valuemax={entries.length} aria-valuenow={standing.mine}>
                <span style={{ width: String(entries.length ? (100 * standing.mine) / entries.length : 0) + "%" }} />
              </div>
            )}
            {standing && standing.friends.length > 0 && (
              <ul className={styles.leaders} aria-label="Friends' progress">
                {standing.friends.slice(0, LEADERS).map((friend) => (
                  <li key={friend.member.username} className={styles.leader}>
                    <Avatar member={friend.member} size={AvatarSize.ExtraSmall} />
                    {displayName(friend.member)}
                    <b>{friend.played}</b>
                  </li>
                ))}
                {others > 0 && <li className={styles.leader}>and {others} more {others === 1 ? "friend" : "friends"}</li>}
              </ul>
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
              setShow(Show.All);
              setQuery("");
              onChoose(value, state);
            }}
          >
            {value === ListTab.State && state ? "Best in " + stateName(state) : TAB_LABELS[value]}
          </button>
        ))}
      </div>
      {CAPTIONS[tab] && <p className={styles.caption}>{CAPTIONS[tab]}</p>}

      <div className={styles.toolbar}>
        {tab === ListTab.State && (
          <span className={styles.stateSelect}>
            <StateSelect id="topStateRankSelect" value={state} onChange={onState} label="State for Best in State" />
          </span>
        )}
        {signedIn && (
          <div className={styles.filters} role="group" aria-label="Show courses">
            {filters.map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={styles.filter}
                aria-pressed={show === value}
                onClick={() => {
                  setShow(value);
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
          {shown.map((entry) => (
            <CourseRow
              key={entry.course.id}
              course={entry.course}
              rank={entry.rank}
              current={list}
              played={entry.played > 0}
              marks={
                entry.played > 0
                  ? [
                      {
                        label: "Played",
                        you: false,
                        onClick: () => {
                          setHistory(entry.course);
                        },
                      },
                    ]
                  : []
              }
              note={entry.played > 1 ? String(entry.played) + " rounds" : undefined}
              friends={entry.friendsPlayed}
              actions={
                <CourseActions
                  course={entry.course}
                  wanted={entry.wantToPlay}
                  signedIn={signedIn}
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
      {logging && signedIn && (
        <LogRoundDialog
          signedIn
          initial={logging}
          played={played}
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
