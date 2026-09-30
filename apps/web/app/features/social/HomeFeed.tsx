import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { FeedItemType, type FeedItem } from "@coursebook/domain/social/types";
import { api, unwrap } from "../../lib/api";
import { fromFeedItem } from "../../lib/api/mappers";
import { apiFailureMessage } from "../../shared/lib/errors";
import { Avatar } from "./Avatar";
import { ComingSoon } from "./ComingSoon";
import { RankPills } from "../top-lists/RankPills";
import { CourseTile } from "./CourseTile";
import { newFromFriends, relativeDay, shortDate, visitLabel, type FeedFirstPage } from "./format";
import { displayName, logPath, profilePath } from "./paths";
import { AvatarSize, TileSize } from "./sizes";
import feedStyles from "./feed.module.css";
import styles from "./social.module.css";

const PAGE_SIZE = 30;
const STRIP = 4;

/**
 * Home for a signed-in member: what their friends played lately, then the
 * feed. Key it by the first page (`feedKey`) so a new first page starts
 * "Show more" over.
 *
 * @param first - The first page from the loader.
 * @param hasFriends - Whether the member has any friends (chooses the empty state).
 * @param me - The member's username, for their own links.
 */
export function HomeFeed({ first, hasFriends, me }: { first: FeedFirstPage; hasFriends: boolean; me: string }) {
  const [more, setMore] = useState<{ items: FeedItem[]; cursor: string | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  const items = more ? [...first.items, ...more.items] : first.items;
  const cursor = more ? more.cursor : first.nextCursor;
  const now = new Date();
  const picks = newFromFriends(items, STRIP);

  const loadMore = () => {
    if (!cursor || loading) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setLoading(true);
    setError(null);
    api
      .GET("/v1/feed", { params: { query: { cursor, limit: PAGE_SIZE } }, signal: controller.signal })
      .then(unwrap)
      .then(
        (page) => {
          if (controller.signal.aborted) return;
          const next = page.items.flatMap((item) => fromFeedItem(item) ?? []);
          setMore((current) => ({ items: [...(current?.items ?? []), ...next], cursor: page.nextCursor }));
          setLoading(false);
        },
        (failure: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("Loading more of the feed failed", failure);
          setError(apiFailureMessage(failure) ?? "Couldn't load more. Try again.");
          setLoading(false);
        },
      );
  };

  return (
    <>
      <div className={feedStyles.head}>
        <span className={feedStyles.eyebrow}>Home</span>
        <h1 className={feedStyles.title}>Where your friends are playing</h1>
      </div>
      <div className={feedStyles.columns}>
        <div className={feedStyles.main}>
          {picks.length > 0 && (
            <section aria-labelledby="new-from-friends">
              <h2 id="new-from-friends" className={styles.sectionLabel}>
                New from friends
              </h2>
              <div className={feedStyles.strip}>
                {picks.map(({ round, member }) => (
                  <Link key={round.id} className={feedStyles.pick} to={profilePath(member.username)}>
                    <CourseTile course={round.course} badge={<Avatar member={member} size={AvatarSize.Small} />} />
                    <span className={feedStyles.pickCaption}>
                      <b>{displayName(member)}</b>
                      <span>{round.playedOn ? shortDate(round.playedOn, now) : "Date not recorded"}</span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="activity">
            <h2 id="activity" className={styles.sectionLabel}>
              Recent activity
            </h2>
            {items.length ? (
              <div>
                {items.map((item) => (
                  <FeedRow key={item.id} item={item} now={now} />
                ))}
              </div>
            ) : hasFriends ? (
              <div className={styles.emptyNote}>
                <strong>Quiet on the course</strong>
                When your friends log rounds, they show up here.
              </div>
            ) : (
              <div className={styles.emptyNote}>
                <strong>Golf is better with friends</strong>
                Add friends to see where they&apos;re playing. <Link to="/friends">Find friends</Link>
              </div>
            )}
            {(cursor || error) && (
              <div className={feedStyles.more}>
                {error && <span className="error-text">{error}</span>}
                {cursor && (
                  <button type="button" className={[styles.button, styles.buttonGhost].join(" ")} disabled={loading} onClick={loadMore}>
                    {loading ? "Loading…" : "Show more"}
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
        <aside className={feedStyles.aside}>
          <div className={feedStyles.cta}>
            <b>Played somewhere?</b>
            <p>Log it and it lands on your timeline and in your friends&apos; feeds.</p>
            <Link className={[styles.button, styles.buttonSolid].join(" ")} to={logPath(me)}>
              + Log a round
            </Link>
          </div>
          <ComingSoon title="Ratings and notes">Rate courses with stars, add a score and a note to each round, and see what friends thought.</ComingSoon>
          <ComingSoon title="Invite friends">Share a link or a QR code on the first tee and become friends in one tap.</ComingSoon>
        </aside>
      </div>
    </>
  );
}

function FeedRow({ item, now }: { item: FeedItem; now: Date }) {
  const name = displayName(item.member);
  const round = item.rounds[0];
  const when = relativeDay(item.at, now);
  if (item.type === FeedItemType.Backfill)
    return (
      <article className={feedStyles.item}>
        <Avatar member={item.member} link />
        <div>
          <p className={feedStyles.sentence}>
            <Link to={profilePath(item.member.username)}>{name}</Link> added {item.count} older {item.count === 1 ? "round" : "rounds"}
          </p>
          <div className={feedStyles.samples}>
            {item.rounds.map((sample) => (
              <span key={sample.id} className={feedStyles.sample}>
                <CourseTile course={sample.course} size={TileSize.Mini} />
                <span>{sample.course.name}</span>
              </span>
            ))}
          </div>
        </div>
        <span className={feedStyles.when}>{when}</span>
      </article>
    );
  if (!round) return null;
  return (
    <article className={feedStyles.item}>
      <Avatar member={item.member} link />
      <div>
        <p className={feedStyles.sentence}>
          <Link to={profilePath(item.member.username)}>{name}</Link> played <span className={feedStyles.course}>{round.course.name}</span>
        </p>
        <div className={feedStyles.meta}>
          <span className={[styles.tag, round.visit === 1 ? styles.tagGold : ""].join(" ")}>{visitLabel(round.visit)}</span>
          {round.playedOn && <span>{shortDate(round.playedOn, now)}</span>}
        </div>
        <RankPills course={round.course} personal={{ owner: name, rank: round.rank }} />
      </div>
      <div style={{ display: "grid", justifyItems: "end", gap: 8 }}>
        <span className={feedStyles.when}>{when}</span>
        <div className={feedStyles.itemTile}>
          <CourseTile course={round.course} size={TileSize.Thumb} />
        </div>
      </div>
    </article>
  );
}

/** Home for visitors who are not signed in. */
export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={feedStyles.welcome}>
      <span className={feedStyles.eyebrow}>coursebook.golf</span>
      <h1 className={feedStyles.welcomeTitle}>
        Every course you&apos;ve played, <em>ranked.</em>
      </h1>
      <p className={feedStyles.lede}>
        Log your rounds, rank the courses you love, work through the Top 100 lists and see where your friends are playing.
      </p>
      <div className={feedStyles.welcomeActions}>
        <button type="button" className={[styles.button, styles.buttonSolid].join(" ")} onClick={onSignIn}>
          Sign in
        </button>
        <Link className={[styles.button, styles.buttonGhost].join(" ")} to="/courses">
          Browse the Top 100
        </Link>
      </div>
      <div className={feedStyles.features}>
        <div className={feedStyles.feature}>
          <b>Your ranking</b>
          <p>Drag your courses into order. Your top four lead your profile.</p>
        </div>
        <div className={feedStyles.feature}>
          <b>Top lists</b>
          <p>Tick off the World, USA, Public and state Top 100s.</p>
        </div>
        <div className={feedStyles.feature}>
          <b>Friends</b>
          <p>See where friends played and how your rankings compare.</p>
        </div>
      </div>
    </div>
  );
}
