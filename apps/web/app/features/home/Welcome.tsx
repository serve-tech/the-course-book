import { Link } from "react-router";
import feedStyles from "../social/feed.module.css";
import styles from "../social/social.module.css";

/** Home for visitors who are not signed in. */
export function Welcome({ onSignIn }: { onSignIn: () => void }) {
  return (
    <div className={feedStyles.welcome}>
      <span className={feedStyles.eyebrow}>The Course Book</span>
      <h1 className={feedStyles.welcomeTitle}>
        Every course you&apos;ve played, <em>ranked.</em>
      </h1>
      <p className={feedStyles.lede}>
        Log your rounds, rank the courses you love, work through the Top 100
        lists and see where your friends are playing.
      </p>
      <div className={feedStyles.welcomeActions}>
        <button
          type="button"
          className={[styles.button, styles.buttonSolid].join(" ")}
          onClick={onSignIn}
        >
          Sign in
        </button>
        <Link
          className={[styles.button, styles.buttonGhost].join(" ")}
          to="/courses"
        >
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
