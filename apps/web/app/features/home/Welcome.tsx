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
        Rank the courses you love, pull out your Top 5 in Michigan or Top 10 in
        the USA, and share it with a link.
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
          <p>Drag your courses into order. Every Top 5 and Top 10 comes from it.</p>
        </div>
        <div className={feedStyles.feature}>
          <b>Share it</b>
          <p>Send a link to any view, or save it all as one tall image.</p>
        </div>
        <div className={feedStyles.feature}>
          <b>Friends</b>
          <p>See how your rankings compare with your friends&apos;.</p>
        </div>
      </div>
    </div>
  );
}
