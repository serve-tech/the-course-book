import type { CoursePage } from "@coursebook/domain/social/types";
import { topListTitle } from "@coursebook/domain/social/top-lists";
import { useState } from "react";
import { Link } from "react-router";
import { cx } from "../../shared/lib/cx";
import { PageHeader } from "../../shared/ui/PageHeader";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { Avatar } from "../social/Avatar";
import { displayName, profilePath } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import { BookmarkIcon, LogIcon } from "../top-lists/icons";
import { rankBadges } from "../top-lists/lists";
import { CourseImage } from "./CourseImage";
import { CreditStyle } from "./credit-style";
import styles from "./course-page.module.css";

/**
 * A course's page, after Top 100 Golf Courses' (decision 2026-11-13): the
 * photo across the top, then the shared page header with the member's
 * standing as its panel, then the course's published ranks and what the
 * member's friends think of it. There is no editorial description or
 * reviews; the ranking is the point.
 *
 * @param page - The course and everyone's standing with it.
 * @param notify - Shows the outcome of an action as a toast.
 * @param openAuth - Opens the sign-in dialog, for the Log dialog.
 */
export function CoursePageView({ page, notify, openAuth }: { page: CoursePage; notify: (message: string) => void; openAuth: () => void }) {
  const { course, friendsRanked, friendsWantToPlay } = page;
  const [logging, setLogging] = useState(false);
  const published = rankBadges(course);
  const photo = course.photo;

  return (
    <article className={styles.page}>
      <CourseImage course={course} credit={CreditStyle.Link} alt={"Photo of " + course.name} priority className={styles.hero} />
      <PageHeader
        eyebrow="Course"
        title={course.name}
        lede={course.location}
        aside={
          <Standing
            page={page}
            onLog={() => {
              setLogging(true);
            }}
            notify={notify}
          />
        }
      />

      {published.length > 0 && (
        <section className={styles.section} aria-labelledby="course-ranked">
          <h2 id="course-ranked" className={styles.heading}>
            Published rankings
          </h2>
          <ul className={styles.ranks}>
            {published.map((badge) => (
              <li key={badge.list.type + badge.list.scope} className={styles.rankTile}>
                <span className={styles.rankNumber}>#{badge.rank}</span>
                <span className={styles.rankList}>{topListTitle(badge.list.type, badge.list.scope)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.section} aria-labelledby="course-friends">
        <h2 id="course-friends" className={styles.heading}>
          Your friends
        </h2>
        {friendsRanked.length === 0 && friendsWantToPlay.length === 0 ? (
          <p className={styles.quiet}>None of your friends has ranked it or saved it to play yet.</p>
        ) : (
          <>
            {friendsRanked.length > 0 && (
              <ul className={styles.friends} aria-label="Friends who rank it">
                {friendsRanked.map((friend) => (
                  <li key={friend.member.username}>
                    <Link to={profilePath(friend.member.username, "ranking")} className={styles.friend}>
                      <Avatar member={friend.member} size={AvatarSize.Small} />
                      <span className={styles.friendName}>{displayName(friend.member)}</span>
                      <span className={styles.friendRank}>
                        #{friend.rank} <span>of {friend.outOf}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {friendsWantToPlay.length > 0 && (
              <p className={styles.quiet}>
                Want to play it: {friendsWantToPlay.map(displayName).join(", ")}
              </p>
            )}
          </>
        )}
      </section>

      {(course.website || photo) && (
        <footer className={styles.footer}>
          {course.website && (
            <a href={course.website} target="_blank" rel="noreferrer">
              {new URL(course.website).hostname.replace(/^www\./, "")}
            </a>
          )}
          {photo && (
            <span>
              Photo:{" "}
              <a href={photo.sourceUrl} target="_blank" rel="noreferrer">
                {photo.credit}
              </a>
              {", "}
              {photo.licenseUrl ? (
                <a href={photo.licenseUrl} target="_blank" rel="noreferrer">
                  {photo.license}
                </a>
              ) : (
                photo.license
              )}
            </span>
          )}
        </footer>
      )}

      {logging && (
        <LogRoundDialog
          signedIn
          initial={course}
          played={{}}
          notify={notify}
          onSignIn={openAuth}
          onClose={() => {
            setLogging(false);
          }}
        />
      )}
    </article>
  );
}

/**
 * The member's standing with the course, as the header's panel: their rank
 * when it is on their ranking, otherwise the ways to add it (Log a round)
 * or save it (Want to play).
 */
function Standing({ page, onLog, notify }: { page: CoursePage; onLog: () => void; notify: (message: string) => void }) {
  const { course, you } = page;
  const { fetcher, busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
  });
  const pending = fetcher.formData?.get("intent");
  const wanted = pending === "want" ? true : pending === "unwant" ? false : you.wantToPlay;

  return (
    <div className={styles.standing}>
      {you.rank !== null ? (
        <>
          <p className={styles.standingLabel}>Your ranking</p>
          <p className={styles.standingRank}>
            #{you.rank} <span>of {you.outOf}</span>
          </p>
          <Link to="/" className={cx(styles.button, styles.buttonGhost)}>
            See your ranking
          </Link>
        </>
      ) : (
        <>
          <p className={styles.standingLabel}>Not on your ranking</p>
          <div className={styles.standingActions}>
            <button type="button" className={styles.button} onClick={onLog}>
              <LogIcon />
              Played it
            </button>
            <button
              type="button"
              className={cx(styles.button, styles.buttonGhost)}
              aria-pressed={wanted}
              disabled={busy}
              onClick={() => {
                submit({ intent: wanted ? "unwant" : "want", courseId: course.id });
              }}
            >
              <BookmarkIcon filled={wanted} />
              {wanted ? "Saved" : "Want to play"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
