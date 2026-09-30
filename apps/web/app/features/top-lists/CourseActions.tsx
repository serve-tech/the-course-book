import type { Course } from "@coursebook/domain/catalog/course";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";
import { BookmarkIcon, LogIcon } from "./icons";
import styles from "./top-lists.module.css";

/**
 * Letterboxd-style buttons on a course row: Log a round (always there) and
 * Want to play (a toggle). Each row posts through its own fetcher, so
 * toggling several rows quickly never cancels an earlier one; while a
 * toggle is pending the button already shows its new state.
 *
 * @param course - The course the buttons act on.
 * @param wanted - Whether it is on the viewer's Want to play list.
 * @param signedIn - Signed-out viewers are sent to sign in instead.
 * @param onLog - Opens the Log dialog for the course.
 * @param notify - Shows the outcome as a toast.
 * @param openAuth - Opens the sign-in dialog.
 */
export function CourseActions({
  course,
  wanted,
  signedIn,
  onLog,
  notify,
  openAuth,
}: {
  course: Course;
  wanted: boolean;
  signedIn: boolean;
  onLog: (course: Course) => void;
  notify: (message: string) => void;
  openAuth: () => void;
}) {
  const { fetcher, busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
  });
  const pending = fetcher.formData?.get("intent");
  const shownWanted = pending === "want" ? true : pending === "unwant" ? false : wanted;

  const requireSignIn = (action: string) => {
    notify("Sign in to " + action);
    openAuth();
  };

  return (
    <div className={styles.actions}>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={"Log a round at " + course.name}
        title="Log a round"
        onClick={() => {
          if (signedIn) onLog(course);
          else requireSignIn("log rounds");
        }}
      >
        <LogIcon />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        aria-label={"Want to play " + course.name}
        aria-pressed={shownWanted}
        title={shownWanted ? "On your Want to play list" : "Want to play"}
        disabled={busy}
        onClick={() => {
          if (!signedIn) {
            requireSignIn("save courses you want to play");
            return;
          }
          submit({ intent: shownWanted ? "unwant" : "want", courseId: course.id });
        }}
      >
        <BookmarkIcon filled={shownWanted} />
      </button>
    </div>
  );
}
