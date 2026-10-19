import { Link, NavLink } from "react-router";
import { BrandMark } from "../../shared/ui/Brand";
import { AccountMenu } from "./AccountMenu";
import type { LayoutMode } from "./layout-preview";
import { mainDestinations } from "./navigation";
import { cx } from "../../shared/lib/cx";
import styles from "./nav.module.css";

/** The signed-in member as the navigation needs them; null when signed out. */
export interface NavMember {
  username: string;
  /** Gives the avatar's initials and accessible name. */
  displayName: string;
}

interface NavProps {
  layout: LayoutMode;
  member: NavMember | null;
  /** Pending friend requests to the member, shown as a badge on Friends. */
  incomingRequests: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onNavigate: () => void;
}

/** Classic and preview share the shell; only their destinations change. */
export function TopBar({
  layout,
  member,
  incomingRequests,
  onSignIn,
  onSignOut,
  onNavigate,
}: NavProps) {
  return (
    <header className={styles.topbar}>
      <Link
        to="/"
        className={styles.brandLink}
        onClick={onNavigate}
        aria-label="The Course Book home"
      >
        <span className="mark bookmark" aria-hidden="true">
          <BrandMark />
        </span>
        <b>The Course Book</b>
      </Link>
      <nav className={styles.links} aria-label="Main">
        <Destinations
          layout={layout}
          member={member}
          incomingRequests={incomingRequests}
          onSignIn={onSignIn}
          onNavigate={onNavigate}
          mobile={false}
        />
      </nav>
      <div className={styles.right} id="authbar">
        {member ? (
          <AccountMenu
            member={member}
            onSignOut={onSignOut}
            onNavigate={onNavigate}
          />
        ) : (
          <button
            type="button"
            className={styles.accountButton}
            id="authOpen"
            onClick={onSignIn}
          >
            Sign in
          </button>
        )}
      </div>
    </header>
  );
}

/** Classic keeps its central Log action; the preview exposes ranking and lists directly. */
export function TabBar({
  layout,
  member,
  incomingRequests,
  onSignIn,
  onNavigate,
}: Omit<NavProps, "onSignOut">) {
  return (
    <nav className={styles.tabbar} aria-label="Main">
      <Destinations
        layout={layout}
        member={member}
        incomingRequests={incomingRequests}
        onSignIn={onSignIn}
        onNavigate={onNavigate}
        mobile
      />
    </nav>
  );
}

function Destinations({
  layout,
  member,
  incomingRequests,
  onSignIn,
  onNavigate,
  mobile,
}: Omit<NavProps, "onSignOut"> & { mobile: boolean }) {
  return mainDestinations(layout, member?.username ?? null, mobile).map(
    ({ label, to, icon, log }) => {
      const content = log ? (
        <span className={styles.plus}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d={icon} />
          </svg>
        </span>
      ) : (
        <>
          {mobile && (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={icon} />
            </svg>
          )}
          {label}
          {to === "/friends" && incomingRequests > 0 && (
            <span
              className={cx(styles.badge, mobile && styles.tabBadge)}
              aria-label={String(incomingRequests) + " friend requests"}
            >
              {incomingRequests}
            </span>
          )}
        </>
      );
      const className = cx(mobile ? styles.tab : styles.link);
      if (to && log)
        return (
          <Link
            key={label}
            to={to}
            className={className}
            onClick={onNavigate}
            aria-label={label}
          >
            {content}
          </Link>
        );
      return to ? (
        <NavLink
          key={label}
          end={to === "/"}
          to={to}
          className={className}
          onClick={onNavigate}
        >
          {content}
        </NavLink>
      ) : (
        <button
          key={label}
          type="button"
          aria-label={log ? label : undefined}
          className={className}
          onClick={onSignIn}
        >
          {content}
        </button>
      );
    },
  );
}
