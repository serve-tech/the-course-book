import { useState } from "react";
import { RegionFilter } from "@coursebook/domain/catalog/course";
import type { MemberListRow } from "@coursebook/domain/friends/types";
import { rankingRows, roundsLabel } from "../journal/ranking";
import { RankingFilters } from "../journal/RankingFilters";
import { CourseRow, type PlayedMark } from "../top-lists/CourseRow";
import styles from "../top-lists/top-lists.module.css";
import { RankingFilter, emptyRankingMessage, filterRanking, rankingFilterOptions } from "./ranking-filter";

/**
 * A friend's ranking, read-only, laid out like the viewer's own Ranking and
 * the Courses page: region tabs, filters for the courses both have played
 * or only the friend has, a search, and the viewer's own rank on each row.
 * There is no "Add to my list" here on purpose: that button logged a round
 * dated today (issue #16); Played it and Want to play replace it.
 *
 * @param rows - The friend's ranking in order.
 * @param name - The friend's display name.
 * @param selectedState - The state for Best in State, shared with the Courses page.
 * @param onState - Chooses that state.
 */
export function FriendRanking({
  rows,
  name,
  selectedState,
  onState,
  onSearchFocus,
}: {
  rows: readonly MemberListRow[];
  name: string;
  selectedState: string;
  onState: (code: string) => void;
  onSearchFocus: (focused: boolean) => void;
}) {
  const [region, setRegion] = useState(RegionFilter.All);
  const [filter, setFilter] = useState(RankingFilter.All);
  const [query, setQuery] = useState("");
  const inRegion = rankingRows(rows, { region, state: selectedState, query: "" });
  const visible = filterRanking(rankingRows(rows, { region, state: selectedState, query }), filter);
  const options = rankingFilterOptions(inRegion, name);

  if (!rows.length) return <div className={styles.empty}>Nothing ranked yet. Their ranking fills in as they log rounds.</div>;
  return (
    <section className={styles.page} aria-label={name + "'s ranking"}>
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
      >
        <div className={styles.filters} role="group" aria-label="Show courses">
          {options.map(([value, label]) => (
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
      </RankingFilters>

      {region === RegionFilter.State && !selectedState ? (
        <div className={styles.empty}>Pick a state to see the courses they've played there.</div>
      ) : !visible.length ? (
        <div className={styles.empty}>{emptyRankingMessage(filter, query.trim() !== "")}</div>
      ) : (
        <ol id="ranking" className={styles.list} aria-label={name + "'s ranking"}>
          {visible.map((row) => (
            <CourseRow
              key={row.course.id}
              course={row.course}
              rank={row.rank}
              current={null}
              marks={yourMark(row)}
              note={row.played > 1 ? roundsLabel(row.played) : undefined}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** The viewer's own rank as a tick, when the course is on their ranking too. */
function yourMark(row: MemberListRow): PlayedMark[] {
  return row.myRank === null ? [] : [{ label: "You #" + String(row.myRank), you: true }];
}
