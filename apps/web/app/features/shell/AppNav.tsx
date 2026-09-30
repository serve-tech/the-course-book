import { Link, NavLink } from "react-router";
import { BrandMark } from "../../shared/ui/Brand";
import { logPath, profilePath } from "../social/paths";
import { cx } from "../../shared/lib/cx";
import styles from "./nav.module.css";

/** The signed-in member as the navigation needs them; null when signed out. */
export interface NavMember {
  username: string;
}

interface NavProps {
  member: NavMember | null;
  /** Pending friend requests to the member, shown as a badge on Friends. */
  incomingRequests: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onNavigate: () => void;
}

/**
 * The top bar: brand, destinations (Home, Courses, Friends, Profile), Log a
 * round and the account. On phones the destinations move to `TabBar`.
 */
export function TopBar({ member, incomingRequests, onSignIn, onSignOut, onNavigate }: NavProps) {
  return (
    <header className={styles.topbar}>
      <Link to="/" className={styles.brandLink} onClick={onNavigate} aria-label="coursebook.golf home">
        <span className="mark bookmark" aria-hidden="true">
          <BrandMark />
        </span>
        <b>
          coursebook<span>.golf</span>
        </b>
      </Link>
      <nav className={styles.links} aria-label="Main">
        <NavLink end to="/" className={cx(styles.link)} onClick={onNavigate}>
          Home
        </NavLink>
        <NavLink to="/courses" className={cx(styles.link)} onClick={onNavigate}>
          Courses
        </NavLink>
        <NavLink to="/friends" className={cx(styles.link)} onClick={onNavigate}>
          Friends
          {incomingRequests > 0 && (
            <span className={styles.badge} aria-label={String(incomingRequests) + " friend requests"}>
              {incomingRequests}
            </span>
          )}
        </NavLink>
        {member ? (
          <NavLink to={profilePath(member.username)} className={cx(styles.link)} onClick={onNavigate}>
            Profile
          </NavLink>
        ) : (
          <button type="button" className={styles.link} onClick={onSignIn}>
            Profile
          </button>
        )}
      </nav>
      <div className={styles.right}>
        {member && (
          <Link to={logPath(member.username)} className={styles.log} onClick={onNavigate}>
            + Log a round
          </Link>
        )}
        <div className={styles.account} id="authbar">
          <span className={styles.accountName} id="authLabel">
            {member ? member.username : "Not signed in"}
          </span>
          <button type="button" className={styles.accountButton} id="authOpen" onClick={member ? onSignOut : onSignIn}>
            {member ? "Sign out" : "Sign in"}
          </button>
        </div>
      </div>
    </header>
  );
}

/** Bottom tabs on phones: Home, Courses, Log, Friends, Profile. */
export function TabBar({ member, incomingRequests, onSignIn, onNavigate }: Omit<NavProps, "onSignOut">) {
  return (
    <nav className={styles.tabbar} aria-label="Main">
      <NavLink end to="/" className={cx(styles.tab)} onClick={onNavigate}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z" />
        </svg>
        Home
      </NavLink>
      <NavLink to="/courses" className={cx(styles.tab)} onClick={onNavigate}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 21V3" />
          <path d="M6 4h11l-2.5 4L17 12H6" />
        </svg>
        Courses
      </NavLink>
      {member ? (
        <Link to={logPath(member.username)} className={styles.tab} onClick={onNavigate} aria-label="Log a round">
          <span className={styles.plus}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </Link>
      ) : (
        <button type="button" className={styles.tab} onClick={onSignIn} aria-label="Log a round">
          <span className={styles.plus}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
        </button>
      )}
      <NavLink to="/friends" className={cx(styles.tab)} onClick={onNavigate}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" />
          <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .8 3.2 2.5 3.6 5.2" />
        </svg>
        Friends
        {incomingRequests > 0 && <span className={[styles.badge, styles.tabBadge].join(" ")}>{incomingRequests}</span>}
      </NavLink>
      {member ? (
        <NavLink to={profilePath(member.username)} className={cx(styles.tab)} onClick={onNavigate}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
          </svg>
          Profile
        </NavLink>
      ) : (
        <button type="button" className={styles.tab} onClick={onSignIn}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
          </svg>
          Profile
        </button>
      )}
    </nav>
  );
}

