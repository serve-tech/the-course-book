import { useEffect, useRef, useState } from "react";
import type { TimelineRound } from "@coursebook/domain/social/types";
import { api, unwrap } from "../../lib/api";
import { fromTimelineRound } from "../../lib/api/mappers";
import { apiFailureMessage } from "../../shared/lib/errors";
import { CourseTile } from "./CourseTile";
import { TileSize } from "./sizes";
import { dayOfMonth, groupByMonth, visitLabel } from "./format";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

const PAGE_SIZE = 20;

/**
 * A member's rounds, newest played first, grouped by month like
 * Letterboxd's diary. The first page comes from the route loader; "Show
 * more" asks the API for the next page with the cursor it returned. Key it
 * by the first page (`timelineKey`) so a new first page starts over.
 *
 * @param username - Whose timeline.
 * @param first - The first page from the loader.
 * @param self - Whether it is the viewer's own timeline (changes the empty state).
 */
export function TimelineView({
  username,
  first,
  self,
}: {
  username: string;
  first: { rounds: readonly TimelineRound[]; nextCursor: string | null };
  self: boolean;
}) {
  const [more, setMore] = useState<{ rounds: TimelineRound[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  // Callers key this component by its first page, so a new first page
  // (another member, or a revalidation) remounts it and starts over.
  useEffect(() => () => inFlight.current?.abort(), []);

  const rounds = more ? [...first.rounds, ...more.rounds] : first.rounds;
  const cursor = more ? more.cursor : first.nextCursor;

  const loadMore = () => {
    if (!cursor || loading) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    api
      .GET("/v1/members/{username}/rounds", {
        params: { path: { username }, query: { cursor, limit: PAGE_SIZE } },
        signal: controller.signal,
      })
      .then(unwrap)
      .then(
        (page) => {
          if (controller.signal.aborted) return;
          setMore((current) => ({ rounds: [...(current?.rounds ?? []), ...page.rounds.map(fromTimelineRound)], cursor: page.nextCursor }));
          setLoading(false);
        },
        (failure: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("Loading more rounds failed", failure);
          setError(apiFailureMessage(failure) ?? "Couldn't load more rounds. Try again.");
          setLoading(false);
        },
      );
  };

  if (!rounds.length)
    return (
      <div className={styles.emptyNote}>
        <strong>{self ? "Your timeline starts with a round" : "No rounds logged yet"}</strong>
        {self ? "Every round you log lands here, newest first." : "Rounds they log will show up here."}
      </div>
    );

  return (
    <div>
      {groupByMonth(rounds).map((month) => (
        <div key={month.key}>
          <h3 className={profileStyles.month}>
            {month.label}
            <small>
              {month.rounds.length} {month.rounds.length === 1 ? "round" : "rounds"}
            </small>
          </h3>
          {month.rounds.map((round) => (
            <div key={round.id} className={profileStyles.entry}>
              <span className={profileStyles.day}>{dayOfMonth(round.playedOn)}</span>
              <CourseTile course={round.course} number={round.rank} size={TileSize.Thumb} />
              <div>
                <span className={profileStyles.entryName}>{round.course.name}</span>
                <span className={profileStyles.entryMeta}>
                  <span className={[styles.tag, round.visit === 1 ? styles.tagGold : ""].join(" ")}>{visitLabel(round.visit)}</span>
                  <span>{round.course.location}</span>
                </span>
              </div>
              <span className={profileStyles.entryRank}>
                <b>#{round.rank}</b>
                ranked
              </span>
            </div>
          ))}
        </div>
      ))}
      {(cursor || error) && (
        <div className={profileStyles.more}>
          {error && <span className="error-text">{error}</span>}
          {cursor && (
            <button type="button" className={[styles.button, styles.buttonGhost].join(" ")} disabled={loading} onClick={loadMore}>
              {loading ? "Loading…" : "Show more rounds"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

