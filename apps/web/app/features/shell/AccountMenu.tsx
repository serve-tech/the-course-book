import type { PublicMember } from "@coursebook/domain/friends/types";
import { useCallback, useRef, useState } from "react";
import { Link } from "react-router";
import { useDismiss } from "../../shared/lib/use-dismiss";
import { Avatar } from "../social/Avatar";
import { displayName, profilePath } from "../social/paths";
import { AvatarSize } from "../social/sizes";
import styles from "./nav.module.css";

interface AccountMenuProps {
  member: PublicMember;
  onSignOut: () => void;
  onNavigate: () => void;
}

/**
 * The signed-in member's avatar in the top bar. It opens a menu, headed by
 * who is signed in, with Profile, Account and Sign out, so the bar itself
 * carries no account buttons. The menu closes on Escape, a press outside it
 * or choosing an item.
 */
export function AccountMenu({ member, onSignOut, onNavigate }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
  }, []);
  useDismiss(open, wrap, close);
  const name = displayName(member);
  const go = () => {
    close();
    onNavigate();
  };

  return (
    <div className={styles.accountMenu} ref={wrap}>
      <button
        type="button"
        className={styles.avatarButton}
        aria-label={"Account menu for " + name}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
        }}
      >
        <Avatar member={member} size={AvatarSize.Medium} />
      </button>
      {open && (
        <div className={styles.menu}>
          <div className={styles.menuHeader}>
            <b>{name}</b>
            <span>@{member.username}</span>
          </div>
          <div role="menu" aria-label="Account">
            <Link role="menuitem" to={profilePath(member.username)} className={styles.menuItem} onClick={go}>
              Profile
            </Link>
            <Link role="menuitem" to="/account" className={styles.menuItem} onClick={go}>
              Account
            </Link>
            <button
              type="button"
              role="menuitem"
              className={styles.menuItem}
              onClick={() => {
                close();
                onSignOut();
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
