import { useCallback, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { ProfileRelationship, type Profile } from "@coursebook/domain/social/types";
import { cx } from "../../shared/lib/cx";
import { useActionFetcher } from "../../shared/lib/use-action-fetcher";
import { useDismiss } from "../../shared/lib/use-dismiss";
import type { FriendReply } from "../../routes/friends";
import { replyMessage } from "../journal/use-journal-fetcher";
import { FriendIntent, UnfriendReason } from "../friends/friend-actions";
import { Avatar } from "./Avatar";
import { displayName, logPath, profilePath } from "./paths";
import { AvatarSize } from "./sizes";
import { monthLabel } from "./format";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * The top of a profile: avatar, name, stats and actions, then the tabs.
 * On a friend's profile, Remove friend sits in the ··· menu (the review
 * found it was the loudest control on the old friend page).
 *
 * @param profile - Whose profile.
 * @param notify - Shows a toast.
 */
export function ProfileHeader({ profile, notify }: { profile: Profile; notify: (message: string) => void }) {
  const self = profile.relationship === ProfileRelationship.Self;
  const name = displayName(profile.member);
  const { stats } = profile;
  return (
    <>
      <div className={profileStyles.hero}>
        <div className={profileStyles.heroInner}>
          <Avatar member={profile.member} size={AvatarSize.Large} />
          <div className={profileStyles.identity}>
            <span className={profileStyles.eyebrow}>{self ? "Your profile" : "Friend"}</span>
            <h1 className={profileStyles.name}>{name}</h1>
            <span className={profileStyles.handle}>
              <b>@{profile.member.username}</b>
              {profile.friendsSince && <> · friends since {monthLabel(profile.friendsSince)}</>}
            </span>
          </div>
          <div className={profileStyles.heroActions}>
            {self ? (
              <Link className={[styles.button, styles.buttonSolid].join(" ")} to={logPath(profile.member.username)}>
                + Log a round
              </Link>
            ) : (
              <FriendMenu username={profile.member.username} name={name} notify={notify} />
            )}
          </div>
          <dl className={profileStyles.stats} aria-label="Stats">
            <Stat value={stats.courses} label="Courses" />
            <Stat value={stats.rounds} label="Rounds" />
            <Stat value={stats.roundsThisYear} label={"In " + String(new Date().getFullYear())} />
            <Stat value={stats.friends} label="Friends" />
          </dl>
        </div>
      </div>
      <nav className={profileStyles.tabs} aria-label="Profile sections">
        <NavLink end className={cx(profileStyles.tab)} to={profilePath(profile.member.username)}>
          Timeline
        </NavLink>
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "ranking")}>
          Ranking
        </NavLink>
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "lists")}>
          Lists
        </NavLink>
        <NavLink className={cx(profileStyles.tab)} to={profilePath(profile.member.username, "stats")}>
          Stats
        </NavLink>
      </nav>
    </>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className={profileStyles.stat}>
      <dd className={profileStyles.statValue} style={{ margin: 0 }}>
        {value.toLocaleString()}
      </dd>
      <dt className={profileStyles.statLabel}>{label}</dt>
    </div>
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
