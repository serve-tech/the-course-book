import { rankingOwner } from "../top-lists/lists";
import styles from "./social.module.css";

/**
 * A member's rank for a course on their own Ranking: a big gold numeral
 * labeled with whose ranking it is ("#25 / Your ranking"), so it never
 * reads like a published rank, which are pills (`RankPills`).
 *
 * @param rank - The course's position on the member's Ranking.
 * @param owner - The member's display name, or null for the viewer.
 */
export function PersonalRank({ rank, owner }: { rank: number; owner: string | null }) {
  return (
    <span className={styles.personalRank} data-personal-rank={rank}>
      <b>#{rank}</b>
      <span>{rankingOwner(owner)}</span>
    </span>
  );
}
