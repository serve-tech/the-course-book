import { useState } from "react";
import type { MemberListRow } from "@coursebook/domain/friends/types";
import { countLabel } from "../../shared/lib/count-label";
import { CourseTile } from "./CourseTile";
import { RankingFilter, filterRanking } from "./ranking-filter";
import { TileSize } from "./sizes";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * A friend's ranking, read-only, next to the viewer's own rank for each
 * course. There is no "Add to my list" here on purpose: that button logged
 * a round dated today (issue #16); Played it and Want to play replace it.
 *
 * @param rows - The friend's ranking in order.
 * @param name - The friend's display name.
 */
export function FriendRanking({ rows, name }: { rows: readonly MemberListRow[]; name: string }) {
  const [filter, setFilter] = useState(RankingFilter.All);
  const visible = filterRanking(rows, filter);
  const options: readonly [RankingFilter, string][] = [
    [RankingFilter.All, countLabel("All", rows.length)],
    [RankingFilter.Both, "Both played"],
    [RankingFilter.OnlyThem, "Only " + name],
  ];
  if (!rows.length)
    return (
      <div className={styles.emptyNote}>
        <strong>Nothing ranked yet</strong>
        Their ranking fills in as they log rounds.
      </div>
    );
  return (
    <div id="friendRanking">
      <div className={profileStyles.filters} role="group" aria-label="Show courses">
        {options.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={profileStyles.filter}
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {!visible.length ? (
        <div className={styles.emptyNote}>
          {filter === RankingFilter.Both ? "You haven't played any of these yet." : "You've played every course on their list."}
        </div>
      ) : (
        visible.map((row) => (
          <div key={row.course.id} className={profileStyles.rankRow} data-course={row.course.name}>
            <span className={profileStyles.rankNumber}>{row.rank}</span>
            <CourseTile course={row.course} size={TileSize.Mini} />
            <div>
              <span className={profileStyles.entryName}>{row.course.name}</span>
              <div className={profileStyles.rankPlace}>
                {row.course.location}
                {row.played > 1 && <> · {row.played} rounds</>}
              </div>
            </div>
            <span className={profileStyles.you}>
              {row.myRank !== null ? (
                <>
                  You <b>#{row.myRank}</b>
                </>
              ) : (
                "Not played"
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
