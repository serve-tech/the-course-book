import type { ListEntry } from "@coursebook/domain/journal/types";
import type { PublicMember } from "@coursebook/domain/friends/types";
import { OwnRanking } from "../journal/OwnRanking";
import { SEARCH_FROM } from "../share/ViewHeader";
import { displayName } from "../social/paths";
import socialStyles from "../social/social.module.css";
import styles from "./home.module.css";
import { openingTop } from "./opening-top";

/**
 * Home: the member's ranking and its share buttons, with no profile header
 * above them, so on a phone the courses are on the first screen. Answers "what
 * are my top courses?" (decision 2026-11-03, ranking-first product).
 *
 * @param rows - The member's ranking in rank order.
 * @param member - The signed-in member.
 * @param onLog - Opens the Log a round dialog over Home.
 */
export function HomeRanking({ rows, member, onLog }: { rows: readonly ListEntry[]; member: PublicMember; onLog: () => void }) {
  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Your ranking</h1>
        <button type="button" className={[socialStyles.button, socialStyles.buttonGhost].join(" ")} onClick={onLog}>
          + Log a round
        </button>
      </div>
      <OwnRanking
        rows={rows}
        username={member.username}
        name={displayName(member)}
        initialTop={openingTop(rows.length)}
        searchFrom={SEARCH_FROM}
      />
    </div>
  );
}
