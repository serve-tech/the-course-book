import { useCallback, useRef, useState } from "react";
import { Link, NavLink, useMatch, useNavigate } from "react-router";
import { ProfileRelationship, type Profile } from "@coursebook/domain/social/types";
import { cx } from "../../shared/lib/cx";
import { useActionFetcher } from "../../shared/lib/use-action-fetcher";
import { useDismiss } from "../../shared/lib/use-dismiss";
import type { FriendReply } from "../../routes/friends";
import { replyMessage } from "../journal/use-journal-fetcher";
import { FriendIntent, UnfriendReason } from "../friends/friend-actions";
import { Avatar } from "./Avatar";
import { displayName, profilePath } from "./paths";
import { AvatarSize } from "./sizes";
import { Stat } from "./Stat";
import { monthLabel } from "./format";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * The top of a profile: avatar, name, stats and actions, then the tabs.
 * On a friend's profile, Remove friend sits in the ··· menu (the review
 * found it was the loudest control on the old friend page).
 *
 * @param profile - Whose profile.
 * @param places - How many U.S. states and countries their courses are in, counted from their ranking.
 * @param notify - Shows a toast.
 * @param onLog - Opens the Log a round dialog over the profile.
 */
export function ProfileHeader({
  profile,
  places,
  notify,
  onLog,
}: {
  profile: Profile;
  places: { states: number; countries: number };
  notify: (message: string) => void;
  onLog: () => void;
}) {
  const self = profile.relationship === ProfileRelationship.Self;
  const name = displayName(profile.member);
  const { stats } = profile;
  // A list's page (/u/<username>/lists/usa) opens from Stats and belongs to it, so Stats stays the current tab there.
  const onList = useMatch("/u/:username/lists/:list") !== null;
  const statsPath = profilePath(profile.member.username, "stats");
  return (
    <>
      <div className={profileStyles.hero}>
        <div className={profileStyles.heroInner}>
          <Avatar member={profile.member} size={AvatarSize.Large} />
          <hgroup className={profileStyles.identity}>
            <p className={profileStyles.eyebrow}>{self ? "Your profile" : "Friend"}</p>
            <h1 className={profileStyles.name}>{name}</h1>
            <p className={profileStyles.handle}>
              <b>@{profile.member.username}</b>
              {profile.friendsSince && <> · friends since {monthLabel(profile.friendsSince)}</>}
            </p>
          </hgroup>
          <div className={profileStyles.heroActions}>
            {self ? (
              <button type="button" className={[styles.button, styles.buttonSolid].join(" ")} onClick={onLog}>
                + Log a round
              </button>
            ) : (
              <FriendMenu username={profile.member.username} name={name} notify={notify} />
            )}
          </div>
          <dl className={profileStyles.stats} aria-label="Stats">
            <Stat value={stats.rounds} label="Round" plural="Rounds" />
            <Stat value={stats.courses} label="Course" plural="Courses" />
            <Stat value={stats.roundsThisYear} label={"In " + String(new Date().getFullYear())} />
            <Stat value={places.states} label="State" plural="States" />
            <Stat value={places.countries} label="Country" plural="Countries" />
            <Stat value={stats.friends} label="Friend" plural="Friends" />
          </dl>
        </div>
      </div>
      <nav className={profileStyles.tabs} aria-label="Profile sections">
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "ranking")}>
          Ranking
        </NavLink>
        {onList ? (
          <Link className={profileStyles.tab} to={statsPath} aria-current="page">
            Stats
          </Link>
        ) : (
          <NavLink className={cx(profileStyles.tab)} to={statsPath}>
            Stats
          </NavLink>
        )}
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "want-to-play")}>
          Want to play
        </NavLink>
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "timeline")}>
          Timeline
        </NavLink>
      </nav>
    </>
  );
}

/**
 * The ··· menu on a friend's profile. Removing leaves the profile first:
 * the profile route skips revalidation for /friends actions, so the page
 * does not flash "not found" while the removal completes.
 */
function FriendMenu({ username, name, notify }: { username: string; name: string; notify: (message: string) => void }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const friend = useActionFetcher<FriendReply>("/friends", (reply) => {
    notify(replyMessage(reply));
    if (!reply.error) void navigate("/friends", { replace: true });
  });

  const close = useCallback(() => {
    setOpen(false);
    setConfirming(false);
  }, []);
  useDismiss(open, wrap, close);

  return (
    <div className={profileStyles.menuWrap} ref={wrap}>
      <span className={[styles.tag, styles.tagGold].join(" ")} style={{ marginRight: 8 }}>
        Friends
      </span>
      <button
        type="button"
        className={profileStyles.menuButton}
        aria-label={"More actions for " + name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setConfirming(false);
        }}
      >
        ···
      </button>
      {open && (
        <div className={profileStyles.menu} role="menu">
          {!confirming ? (
            <button
              type="button"
              role="menuitem"
              className={profileStyles.menuItem}
              onClick={() => {
                setConfirming(true);
              }}
            >
              Remove friend…
            </button>
          ) : (
            <div className={profileStyles.confirm}>
              <span>
                Remove {name} as a friend? You will stop seeing each other&apos;s rounds and rankings.
              </span>
              <div className={profileStyles.confirmActions}>
                <button
                  type="button"
                  className={[styles.button, styles.buttonGhost].join(" ")}
                  onClick={() => {
                    setConfirming(false);
                  }}
                >
                  Keep
                </button>
                <button
                  type="button"
                  className={[styles.button, profileStyles.danger].join(" ")}
                  disabled={friend.busy}
                  onClick={() => {
                    friend.submit({ intent: FriendIntent.Unfriend, username, reason: UnfriendReason.Remove });
                  }}
                >
                  {friend.busy ? "Removing…" : "Remove friend"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
