import { useMemo, type ReactNode } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import listStyles from "../top-lists/top-lists.module.css";
import type { RankingImageContent } from "./ranking-image";
import { ShareActions } from "./ShareActions";
import { imageFileName, sharePath, shareViewTitle, TOP_CHOICES, type ShareView } from "@coursebook/domain/sharing/view";
import styles from "./share.module.css";

/** Views with this many courses or fewer need no search, and on a phone it pushes the courses off the first screen. */
export const SEARCH_FROM = 10;

/**
 * The buttons that cut a ranking to its top courses.
 *
 * @param top - How many courses the view shows; null shows them all.
 * @param onTop - Chooses how many to show.
 */
export function TopChoices({ top, onTop }: { top: number | null; onTop: (top: number | null) => void }) {
  return (
    <div className={listStyles.filters} role="group" aria-label="How many courses">
      {[null, ...TOP_CHOICES].map((choice) => (
        <button
          key={choice ?? "all"}
          type="button"
          className={listStyles.filter}
          aria-pressed={top === choice}
          onClick={() => {
            onTop(choice);
          }}
        >
          {choice === null ? "All" : "Top " + String(choice)}
        </button>
      ))}
    </div>
  );
}

/**
 * A view's title and caption beside its Copy link and Save image, the same on
 * the member's own ranking and their public page, so what a member sees is
 * what the link and the image show.
 *
 * @param username - Whose ranking, for the link and the file name.
 * @param memberName - The name the image shows.
 * @param view - The view on screen.
 * @param rows - The view's rows, numbered within it. Memoize them: a new array
 *   draws the image again.
 * @param notify - Shows a toast.
 * @param render - Draws the image; a test double in unit tests, because jsdom has no canvas.
 * @param children - The caption under the title.
 */
export function ViewHeader({
  username,
  memberName,
  view,
  rows,
  notify,
  render,
  children,
}: {
  username: string;
  memberName: string;
  view: ShareView;
  rows: readonly { course: Course; rank: number }[];
  notify: (message: string) => void;
  render?: ((content: RankingImageContent) => Promise<Blob>) | undefined;
  children: ReactNode;
}) {
  const title = shareViewTitle(view);
  const image = useMemo(
    () => ({
      memberName,
      title,
      rows: rows.map((row) => ({ rank: row.rank, name: row.course.name, place: row.course.location })),
    }),
    [memberName, title, rows],
  );
  return (
    <div className={styles.viewHeader}>
      <div className={styles.viewTitle}>
        <h2 className={styles.heading}>{title}</h2>
        <p className={styles.caption} aria-live="polite">
          {children}
        </p>
      </div>
      <ShareActions
        path={sharePath(username, view)}
        image={image}
        fileName={imageFileName(username, title)}
        notify={notify}
        {...(render ? { render } : {})}
      />
    </div>
  );
}
