import type { ListEntry } from "@coursebook/domain/journal/types";
import type { PublicMember } from "@coursebook/domain/friends/types";
import { OwnRanking } from "../journal/OwnRanking";
import { SEARCH_FROM } from "../share/ViewHeader";
import { displayName } from "../social/paths";
import socialStyles from "../social/social.module.css";
import styles from "./home.module.css";
import { openingTop } from "./opening-top";

/**
 * Home: the member's ranking under the same header as the Courses page, with
 * the view and its share buttons in the panel beside the title. Answers "what
 * are my top courses?" (decision 2026-11-03, ranking-first product), so rows
 * leave out round counts, which rounds' own screens still show.
 *
 * @param rows - The member's ranking in rank order.
 * @param member - The signed-in member.
 * @param onLog - Opens the Log a round dialog over Home.
 */
export function HomeRanking({ rows, member, onLog }: { rows: readonly ListEntry[]; member: PublicMember; onLog: () => void }) {
  return (
    <OwnRanking
      rows={rows}
      username={member.username}
      name={displayName(member)}
      initialTop={openingTop(rows.length)}
      searchFrom={SEARCH_FROM}
      showRounds={false}
      heading={{
        eyebrow: "Your course book",
        title: "Your ranking",
        lede: "Every course you've played, best first.",
        children: (
          <button type="button" className={[socialStyles.button, socialStyles.buttonGhost, styles.log].join(" ")} onClick={onLog}>
            + Log a round
          </button>
        ),
      }}
    />
  );
}
