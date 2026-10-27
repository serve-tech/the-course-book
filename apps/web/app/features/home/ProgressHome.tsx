import { useState } from "react";
import { Link, useNavigate, useNavigation } from "react-router";
import type { Course } from "@coursebook/domain/catalog/course";
import type { ListEntry } from "@coursebook/domain/journal/types";
import type { FeedItem, TopListCourse, TopListStanding } from "@coursebook/domain/social/types";
import { cx } from "../../shared/lib/cx";
import { HOME_GOAL_LIST_KEY, preferences } from "../../shared/lib/storage";
import { useShell } from "../../shared/ui/shell";
import { coursesLabel } from "../journal/ranking";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { Avatar } from "../social/Avatar";
import { newFromFriends, shortDate, visitLabel } from "../social/format";
import { displayName, logPath, profilePath } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import { TopFour } from "../social/TopFour";
import socialStyles from "../social/social.module.css";
import { CourseActions } from "../top-lists/CourseActions";
import { CourseRow } from "../top-lists/CourseRow";
import { sameList, topListSlug } from "../top-lists/lists";
import topListStyles from "../top-lists/top-lists.module.css";
import { friendNote, myRanks } from "./friend-note";
import { goalChoices, GoalReason, upNext, type GoalList } from "./goal-list";
import styles from "./home.module.css";

/** Friends' rounds on Home; Activity has the rest. */
const FRIEND_ROUNDS = 3;
/** Courses in Up next; the list page has the rest. */
const UP_NEXT = 3;

const REASONS: Readonly<Record<GoalReason, string>> = {
  [GoalReason.Chosen]: "Your pick",
  [GoalReason.HomeState]: "Your home state",
  [GoalReason.Closest]: "Your closest list",
  [GoalReason.FirstList]: "Where to start",
};

/**
 * Home in the course-first preview (decision 2026-10-27). One focal point,
 * the member's progress on the list Home tracks, holds the page's only solid
 * action, Log a round. Below it: the member's other lists, any of which they
 * can track instead; the next courses to play on the tracked list, with the
 * same Log and Want to play buttons as Courses; friends' latest rounds, noted
 * from the member's side; and their top four. The full ranking editor stays
 * one tap away on their profile.
 *
 * @param homeState - The state Best in State uses ("" when unknown).
 * @param standings - Every published list with the member's and friends' progress.
 * @param goal - The list Home tracks; null when no list has courses.
 * @param goalCourses - That list's courses in rank order, with the member's rounds and Want to play.
 * @param activity - The newest feed items; Home shows a few rounds from them.
 * @param rows - The member's ranking, for the top four, the notes and the Log dialog.
 * @param username - The member, for their Log, ranking and list links.
 */
export function ProgressHome({
  homeState,
  standings,
  goal,
  goalCourses,
  activity,
  rows,
  username,
}: {
  homeState: string;
  standings: readonly TopListStanding[];
  goal: GoalList | null;
  goalCourses: readonly TopListCourse[];
  activity: readonly FeedItem[];
  rows: readonly ListEntry[];
  username: string;
}) {
  const shell = useShell();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [logging, setLogging] = useState<Course | null>(null);
  // Only a goal change stays on Home; any other navigation leaves the page.
  const switching = navigation.state === "loading" && navigation.location.pathname === "/";

  const track = (standing: TopListStanding) => {
    const slug = topListSlug(standing.list);
    if (!saveGoal(slug)) shell.notify("Couldn't remember that list on this browser. Home shows it until you leave.");
    void navigate("?goal=" + slug, { replace: true, preventScrollReset: true });
  };

  return (
    <div className={styles.page} aria-busy={switching}>
      <GoalHero goal={goal} username={username} switching={switching} />
      {goal && (
        <section aria-labelledby="your-lists">
          <h2 id="your-lists" className={socialStyles.sectionLabel}>
            Your lists <Link to={profilePath(username, "lists")}>All lists</Link>
          </h2>
          <div className={styles.choices}>
            {goalChoices(standings, homeState, goal).map((choice) => {
              const tracked = sameList(choice.list, goal.standing.list);
              return (
                <button
                  key={topListSlug(choice.list)}
                  type="button"
                  className={styles.choice}
                  aria-pressed={tracked}
                  aria-label={"Track " + choice.list.title + ", " + String(choice.mine) + " of " + String(choice.list.size) + " played"}
                  onClick={() => {
                    if (!tracked) track(choice);
                  }}
                >
                  <span className={styles.choiceTitle}>{choice.list.title}</span>
                  <span className={styles.choiceCount}>
                    <b>{choice.mine}</b> / {choice.list.size}
                  </span>
                  <span className={styles.choiceBar} aria-hidden="true">
                    <span style={{ width: share(choice.mine, choice.list.size) }} />
                  </span>
                  {tracked && <span className={styles.tracking}>On Home</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}
      <div className={styles.columns}>
        {goal && (
          <section aria-labelledby="up-next" className={cx(styles.upNext, switching && styles.switching)}>
            <h2 id="up-next" className={socialStyles.sectionLabel}>
              Up next on {goal.standing.list.title} <Link to={"/courses?list=" + topListSlug(goal.standing.list)}>See the list</Link>
            </h2>
            <UpNextCourses goal={goal} courses={upNext(goalCourses, UP_NEXT)} onLog={setLogging} />
          </section>
        )}
        <div className={styles.side}>
          <section aria-labelledby="from-friends">
            <h2 id="from-friends" className={socialStyles.sectionLabel}>
              From your friends <Link to="/activity">All activity</Link>
            </h2>
            <FriendRounds activity={activity} rows={rows} />
          </section>
          <div className={styles.taste}>
            <TopFour rows={rows} self action={<Link to={profilePath(username, "ranking")}>Your ranking</Link>} />
            {rows.length > 0 && <p className={styles.ranked}>{coursesLabel(rows.length)} ranked</p>}
          </div>
        </div>
      </div>
      {logging && (
        <LogRoundDialog
          signedIn
          initial={logging}
          played={Object.fromEntries(rows.map((row) => [row.course.id, row.played]))}
          notify={shell.notify}
          onSignIn={shell.openAuth}
          onClose={() => {
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}

/** The focal point: progress on the tracked list and Log a round. */
function GoalHero({ goal, username, switching }: { goal: GoalList | null; username: string; switching: boolean }) {
  const log = (
    <Link to={logPath(username)} className={cx(socialStyles.button, socialStyles.buttonSolid)}>
      + Log a round
    </Link>
  );
  if (!goal)
    return (
      <section className={styles.hero} aria-labelledby="goal-title">
        <div className={styles.goal}>
          <p className={styles.eyebrow}>Your course book</p>
          <h1 id="goal-title" className={styles.goalTitle}>
            Log a round to start your ranking
          </h1>
        </div>
        <div className={styles.actions}>{log}</div>
      </section>
    );

  const { list, mine, friends } = goal.standing;
  const left = list.size - mine;
  const leader = friends[0];
  return (
    <section className={cx(styles.hero, switching && styles.switching)} aria-labelledby="goal-title">
      <div className={styles.goal}>
        <p className={styles.eyebrow}>{REASONS[goal.reason]}</p>
        <h1 id="goal-title" className={styles.goalTitle}>
          {list.title}
        </h1>
        <p className={styles.count}>
          <b>{mine}</b>
          <span>
            of {list.size} played{left > 0 ? " · " + String(left) + " to go" : ""}
          </span>
        </p>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label={list.title + " played"}
          aria-valuemin={0}
          aria-valuemax={list.size}
          aria-valuenow={mine}
        >
          <span style={{ width: share(mine, list.size) }} />
        </div>
        {(mine === 0 || leader) && (
          <p className={styles.compare}>
            {mine === 0 && "Log the courses you've played on it and watch this fill in. "}
            {leader && (
              <>
                <b>{displayName(leader.member)}</b> has played {leader.played}.
              </>
            )}
          </p>
        )}
      </div>
      <div className={styles.actions}>{log}</div>
    </section>
  );
}

/** The next courses on the tracked list, with Log and Want to play like Courses. */
function UpNextCourses({ goal, courses, onLog }: { goal: GoalList; courses: readonly TopListCourse[]; onLog: (course: Course) => void }) {
  const shell = useShell();
  if (!courses.length)
    return (
      <div className={socialStyles.emptyNote}>
        <strong>Every course played</strong>
        Pick another list to track above.
      </div>
    );
  return (
    <ol className={topListStyles.list} aria-label={"Up next on " + goal.standing.list.title}>
      {courses.map((entry) => (
        <CourseRow
          key={entry.course.id}
          course={entry.course}
          rank={entry.rank}
          current={goal.standing.list}
          marks={[]}
          note={entry.wantToPlay ? "On your Want to play" : undefined}
          friends={entry.friendsPlayed}
          actions={
            <CourseActions
              course={entry.course}
              wanted={entry.wantToPlay}
              signedIn
              onLog={onLog}
              notify={shell.notify}
              openAuth={shell.openAuth}
            />
          }
        />
      ))}
    </ol>
  );
}

/** A few friends' rounds at different courses, each noted from the member's side. */
function FriendRounds({ activity, rows }: { activity: readonly FeedItem[]; rows: readonly ListEntry[] }) {
  const picks = newFromFriends(activity, FRIEND_ROUNDS);
  if (!picks.length)
    return (
      <div className={socialStyles.emptyNote}>
        <strong>Quiet on the course</strong>
        When friends log rounds, they show up here. <Link to="/friends">Find friends</Link>
      </div>
    );
  const ranks = myRanks(rows);
  const now = new Date();
  return (
    <ul className={styles.rounds}>
      {picks.map(({ round, member }) => {
        const note = friendNote(round.course, ranks);
        return (
          <li key={round.id} className={styles.round}>
            <Avatar member={member} size={AvatarSize.Small} link />
            <div className={styles.roundText}>
              <p className={styles.sentence}>
                <Link to={profilePath(member.username)}>{displayName(member)}</Link> played{" "}
                <span className={styles.course}>{round.course.name}</span>
              </p>
              <p className={styles.meta}>
                {round.playedOn ? shortDate(round.playedOn, now) + " · " : ""}
                {visitLabel(round.visit)}
              </p>
            </div>
            {note && <span className={styles.note}>{note}</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** A bar width; lists with no courses never reach Home. */
function share(played: number, size: number): string {
  return String((played / size) * 100) + "%";
}

/**
 * Remember the list Home tracks on this browser. A failed write is reported,
 * not hidden: the choice still shows now, through the URL, but resets later.
 */
function saveGoal(slug: string): boolean {
  try {
    return preferences().write(HOME_GOAL_LIST_KEY, slug);
  } catch (error) {
    console.warn("Could not access saved preferences", error);
    return false;
  }
}
