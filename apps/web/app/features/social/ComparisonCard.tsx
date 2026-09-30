import type { ProfileComparison } from "@coursebook/domain/social/types";
import { percent } from "./format";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * "You and Maya": how a friend's ranking compares with the viewer's, over
 * the courses both have ranked.
 *
 * @param comparison - From the profile.
 * @param name - The friend's display name.
 */
export function ComparisonCard({ comparison, name }: { comparison: ProfileComparison; name: string }) {
  const { inCommon, agreement, biggestSplit } = comparison;
  return (
    <section aria-labelledby="compare">
      <h2 id="compare" className={styles.sectionLabel}>
        You and {name}
      </h2>
      <div className={profileStyles.compare}>
        <div className={profileStyles.compareTop}>
          <span className={profileStyles.compareBig}>
            {inCommon}
            <small>in common</small>
          </span>
          {agreement !== null && (
            <span className={profileStyles.compareBig}>
              {percent(agreement)}
              <small>agree</small>
            </span>
          )}
        </div>
        {agreement !== null && (
          <div
            className={profileStyles.meter}
            role="meter"
            aria-label="How often your rankings agree"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(agreement * 100)}
          >
            <span style={{ width: percent(agreement) }} />
          </div>
        )}
        {inCommon === 0 ? (
          <p className={profileStyles.compareLine}>No courses in common yet. Play one of theirs and this fills in.</p>
        ) : agreement === null ? (
          <p className={profileStyles.compareLine}>Share three courses and you&apos;ll see how often your rankings agree.</p>
        ) : (
          <p className={profileStyles.compareLine}>
            When you both ranked two courses, you put them in the same order {percent(agreement)} of the time.
          </p>
        )}
        {biggestSplit && (
          <p className={profileStyles.compareLine}>
            Biggest split: <b>{biggestSplit.course.name}</b>, their #{biggestSplit.theirRank} and your #{biggestSplit.myRank}.
          </p>
        )}
      </div>
    </section>
  );
}
