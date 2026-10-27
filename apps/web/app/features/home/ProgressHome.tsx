import { Link } from "react-router";
import type { ListEntry } from "@coursebook/domain/journal/types";
import type { FeedItem, TopListStanding } from "@coursebook/domain/social/types";
import { cx } from "../../shared/lib/cx";
import { useShell } from "../../shared/ui/shell";
import { coursesLabel } from "../journal/ranking";
import { Avatar } from "../social/Avatar";
import { newFromFriends, shortDate, visitLabel } from "../social/format";
import { displayName, logPath, profilePath } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import { TopFour } from "../social/TopFour";
import socialStyles from "../social/social.module.css";
import { topListSlug } from "../top-lists/lists";
import { friendNote, myRanks } from "./friend-note";
import { chooseGoalList, GoalReason, type GoalList } from "./goal-list";
import styles from "./home.module.css";

/** Friends' rounds on Home; Activity has the rest. */
const FRIEND_ROUNDS = 3;

const REASONS: Readonly<Record<GoalReason, string>> = {
  [GoalReason.HomeState]: "Your home state",
  [GoalReason.Closest]: "Your closest list",
  [GoalReason.FirstList]: "Where to start",
};

/**
 * Home in the course-first preview: one focal point, then what to do next
 * (decision 2026-10-27). The member's progress on one published list leads,
 * with Log a round as the page's only solid action; friends' latest rounds
 * follow, each noted from the member's side; their top four close it. The
 * full ranking editor stays one tap away on their profile.
 *
 * @param standings - Every published list with the member's and friends' progress.
 * @param activity - The newest feed items; Home shows a few rounds from them.
 * @param rows - The member's ranking, for the top four and the notes.
 * @param username - The member, for their Log and ranking links.
 */
export function ProgressHome({
  standings,
  activity,
  rows,
  username,
}: {
  standings: readonly TopListStanding[];
  activity: readonly FeedItem[];
  rows: readonly ListEntry[];
  username: string;
}) {
  const shell = useShell();
  const goal = chooseGoalList(standings, shell.selectedState);
  const ranks = myRanks(rows);
  const picks = newFromFriends(activity, FRIEND_ROUNDS);
  const now = new Date();

  return (
    <div className={styles.page}>
      <GoalHero goal={goal} username={username} />
      <div className={styles.columns}>
        <section aria-labelledby="from-friends">
          <h2 id="from-friends" className={socialStyles.sectionLabel}>
            From your friends <Link to="/activity">All activity</Link>
          </h2>
          {picks.length ? (
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
          ) : (
            <div className={socialStyles.emptyNote}>
              <strong>Quiet on the course</strong>
              When friends log rounds, they show up here. <Link to="/friends">Find friends</Link>
            </div>
          )}
        </section>
        <div className={styles.taste}>
          <TopFour rows={rows} self action={<Link to={profilePath(username, "ranking")}>Your ranking</Link>} />
          {rows.length > 0 && <p className={styles.ranked}>{coursesLabel(rows.length)} ranked</p>}
        </div>
      </div>
    </div>
  );
}

/** The focal point: progress on the goal list, Log a round, and the list itself. */
function GoalHero({ goal, username }: { goal: GoalList | null; username: string }) {
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
    <section className={styles.hero} aria-labelledby="goal-title">
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
          <span style={{ width: String((mine / list.size) * 100) + "%" }} />
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
      <div className={styles.actions}>
        {log}
        <Link to={"/courses?list=" + topListSlug(list)} className={cx(socialStyles.button, socialStyles.buttonGhost)}>
          See the list
        </Link>
      </div>
    </section>
  );
}
