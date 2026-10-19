import { Link } from "react-router";
import type { ListEntry } from "@coursebook/domain/journal/types";
import { OwnRanking } from "../journal/OwnRanking";
import { coursesLabel } from "../journal/ranking";
import { logPath, profilePath } from "../social/paths";
import { cx } from "../../shared/lib/cx";
import socialStyles from "../social/social.module.css";
import styles from "./home.module.css";

/** Home is the full editable list; other lists and course discovery stay close by. */
export function RankingHome({
  rows,
  username,
}: {
  rows: readonly ListEntry[];
  username: string;
}) {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Your course book</p>
          <h1 className={styles.title}>
            Your courses, <em>ranked.</em>
          </h1>
          <p className={styles.lede}>
            {rows.length
              ? `${coursesLabel(rows.length)} played. Every favorite in its place.`
              : "Every great list starts with a round."}
          </p>
        </div>
        <Link
          to={logPath()}
          className={cx(socialStyles.button, socialStyles.buttonSolid)}
        >
          + Log a round
        </Link>
      </div>

      <div className={styles.columns}>
        <div className={styles.ranking}>
          <h2 className={styles.sectionTitle}>My ranking</h2>
          <OwnRanking rows={rows} />
        </div>
        <aside className={styles.aside} aria-label="More from your course book">
          <Link className={styles.listCard} to={profilePath(username, "lists")}>
            <span className={styles.eyebrow}>Keep track</span>
            <strong>
              My lists <span aria-hidden="true">↗</span>
            </strong>
            <span>
              Your Top 100 progress and the courses you want to play, together.
            </span>
          </Link>
          <section className={styles.explore} aria-labelledby="explore-lists">
            <h2 id="explore-lists" className={styles.sectionTitle}>
              Find your next favorite
            </h2>
            <Link to="/courses?list=world">
              <span>World Top 100</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/courses?list=usa-public">
              <span>USA Public Top 100</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/courses?list=state">
              <span>Best in State</span>
              <span aria-hidden="true">→</span>
            </Link>
            <Link to="/courses" className={styles.browse}>
              Browse all Top lists <span aria-hidden="true">→</span>
            </Link>
          </section>
          <Link className={styles.activity} to="/activity">
            See where friends are playing <span aria-hidden="true">→</span>
          </Link>
        </aside>
      </div>
    </div>
  );
}
