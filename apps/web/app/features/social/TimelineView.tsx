import { useEffect, useRef, useState } from "react";
import type { TimelineRound } from "@coursebook/domain/social/types";
import { api, unwrap } from "../../lib/api";
import { fromTimelineRound } from "../../lib/api/mappers";
import { apiFailureMessage } from "../../shared/lib/errors";
import { TrashIcon } from "../top-lists/icons";
import { RankPills } from "../top-lists/RankPills";
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
 * @param self - Whether it is the viewer's own timeline (changes the empty state and the rank pills' "Your").
 * @param name - The member's display name, for "Dan Whitaker's ranking #3" on a friend's timeline.
 * @param onDelete - Deletes one of the viewer's own rounds; each entry gets a delete button when given.
 * @param deleting - The id of the round being deleted, if any.
 */
export function TimelineView({
  username,
  first,
  self,
  name,
  onDelete,
  deleting = null,
}: {
  username: string;
  first: { rounds: readonly TimelineRound[]; nextCursor: string | null };
  self: boolean;
  name: string;
  onDelete?: ((round: TimelineRound) => void) | undefined;
  deleting?: string | null;
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
            <div key={round.id} className={[profileStyles.entry, onDelete ? profileStyles.entryOwn : ""].join(" ")} data-round={round.course.name}>
              <span className={profileStyles.day}>{dayOfMonth(round.playedOn)}</span>
              <CourseTile course={round.course} size={TileSize.Thumb} />
              <div>
                <span className={profileStyles.entryName}>{round.course.name}</span>
                <span className={profileStyles.entryMeta}>
                  <span className={[styles.tag, round.visit === 1 ? styles.tagGold : ""].join(" ")}>{visitLabel(round.visit)}</span>
                  <span>{round.course.location}</span>
                </span>
                <RankPills course={round.course} personal={{ owner: self ? null : name, rank: round.rank }} />
              </div>
              {onDelete && (
                <button
                  type="button"
                  className={profileStyles.entryDelete}
                  aria-label={"Delete your round at " + round.course.name + (round.playedOn ? " on " + round.playedOn : "")}
                  title="Delete this round"
                  disabled={deleting !== null}
                  onClick={() => {
                    onDelete(round);
                  }}
                >
                  <TrashIcon />
                </button>
              )}
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

