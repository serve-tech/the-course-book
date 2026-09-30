import type { MemberListRow } from "@coursebook/domain/friends/types";
import { CourseTile } from "./CourseTile";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * A member's four favorite courses: ranks 1-4 of their ranking. Letterboxd
 * asks members to pick four favorites; a ranking already says what they
 * are, so there is nothing to curate.
 *
 * @param rows - The member's top rows, in rank order.
 * @param self - Whether it is the viewer's own profile (changes the empty state).
 */
export function TopFour({ rows, self }: { rows: readonly MemberListRow[]; self: boolean }) {
  return (
    <section className={profileStyles.section} aria-labelledby="top-four">
      <h2 id="top-four" className={styles.sectionLabel}>
        Top four
      </h2>
      {rows.length ? (
        <div className={profileStyles.topFour}>
          {rows.slice(0, 4).map((row) => (
            <CourseTile key={row.course.id} course={row.course} number={row.rank} />
          ))}
        </div>
      ) : (
        <div className={styles.emptyNote}>
          <strong>{self ? "Your top four live here" : "Nothing ranked yet"}</strong>
          {self ? "Log a round and your four highest-ranked courses appear here." : "Their top courses will show up once they log a round."}
        </div>
      )}
    </section>
  );
}
