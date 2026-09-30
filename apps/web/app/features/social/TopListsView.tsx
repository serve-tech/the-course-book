import type { TopListProgress } from "@coursebook/domain/social/top-lists";
import { ComingSoon } from "./ComingSoon";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * The Lists tab: progress through the published Top lists, then the lists
 * that are still to come (Want to play, lists members make).
 *
 * @param progress - One row per list, in display order.
 * @param self - Whether it is the viewer's own profile.
 * @param name - The member's display name.
 */
export function TopListsView({ progress, self, name }: { progress: readonly TopListProgress[]; self: boolean; name: string }) {
  return (
    <div className={profileStyles.columns}>
      <section className={profileStyles.section} aria-labelledby="top-lists">
        <h2 id="top-lists" className={styles.sectionLabel}>
          Top lists
        </h2>
        <div className={profileStyles.progressList}>
          {progress.map((list) => (
            <div key={list.type + list.scope} className={profileStyles.progressRow}>
              <div className={profileStyles.progressHead}>
                <span className={profileStyles.progressTitle}>{list.title}</span>
                <span className={profileStyles.progressCount}>
                  {list.played}
                  <small> / {list.size}</small>
                </span>
              </div>
              <div
                className={profileStyles.bar}
                role="progressbar"
                aria-label={list.title}
                aria-valuemin={0}
                aria-valuemax={list.size}
                aria-valuenow={list.played}
              >
                <span style={{ width: String(list.size ? (100 * list.played) / list.size : 0) + "%" }} />
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className={profileStyles.aside}>
        <div className={profileStyles.soonStack}>
          <ComingSoon title="Want to play">
            {self
              ? "Save courses you want to play, see which friends want them too, and tick them off when you do."
              : "The courses " + name + " wants to play, and the ones you both want."}
          </ComingSoon>
          <ComingSoon title="Lists">
            {self ? "Make your own lists, ranked or not, like a Bandon trip or the best munis in Michigan." : "Lists " + name + " makes will appear here."}
          </ComingSoon>
        </div>
      </aside>
    </div>
  );
}
