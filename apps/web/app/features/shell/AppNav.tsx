import { Link, NavLink } from "react-router";
import { BrandMark } from "../../shared/ui/Brand";
import { AccountMenu } from "./AccountMenu";
import { profilePath } from "../social/paths";
import { cx } from "../../shared/lib/cx";
import styles from "./nav.module.css";

/** The signed-in member as the navigation needs them; null when signed out. */
export interface NavMember {
  username: string;
  /** Gives the avatar's initials and accessible name. */
  displayName: string;
}

interface NavProps {
  member: NavMember | null;
  /** Pending friend requests to the member, shown as a badge on Friends. */
  incomingRequests: number;
  onSignIn: () => void;
  onSignOut: () => void;
  onNavigate: () => void;
}

/** The main destinations are courses and lists; Profile stays in the account menu. */
export function TopBar({
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

/** The same destinations on phones, in the same order as desktop. */
export function TabBar({
  member,
  incomingRequests,
  onSignIn,
  onNavigate,
}: Omit<NavProps, "onSignOut">) {
  return (
    <nav className={styles.tabbar} aria-label="Main">
      <Destinations
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
  member,
  incomingRequests,
  onSignIn,
  onNavigate,
  mobile,
}: Omit<NavProps, "onSignOut"> & { mobile: boolean }) {
  const destinations = [
    {
      label: member ? "My ranking" : "Home",
      to: "/",
      icon: "M4 6h2m4 0h10M4 12h2m4 0h10M4 18h2m4 0h10",
    },
    {
      label: "My lists",
      to: member ? profilePath(member.username, "lists") : null,
      icon: "M6 3h12v18l-6-4-6 4z",
    },
    { label: "Courses", to: "/courses", icon: "M6 21V3m0 1h11l-2.5 4L17 12H6" },
    { label: "Activity", to: "/activity", icon: "M3 12h4l3-8 4 16 3-8h4" },
    {
      label: "Friends",
      to: "/friends",
      icon: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c2 .8 3.2 2.5 3.6 5.2",
    },
  ];
  return destinations.map(({ label, to, icon }) => {
    const content = (
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
        className={className}
        onClick={onSignIn}
      >
        {content}
      </button>
    );
  });
}
