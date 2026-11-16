import { useState } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import type { WantToPlayEntry } from "@coursebook/domain/social/types";
import type { ViewerCourses } from "../../lib/api/viewer";
import { localDate } from "../../shared/lib/local-date";
import type { Notify } from "../../shared/ui/shell";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { RoundHistory } from "../rounds/RoundHistory";
import { CourseActions } from "../top-lists/CourseActions";
import { CourseRow, type PlayedMark } from "../top-lists/CourseRow";
import topListStyles from "../top-lists/top-lists.module.css";
import { shortDate } from "./format";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * The Want to play tab: the courses a member has saved to play, newest
 * first, each with the viewer's own buttons.
 *
 * @param name - The member's display name.
 * @param self - Whether it is the viewer's own profile.
 * @param wantToPlay - Their Want to play list, newest first.
 * @param memberPlayed - Ids of the courses they played.
 * @param viewer - The viewer's courses and Want to play list, for the row buttons.
 * @param notify - Shows a toast.
 * @param openAuth - Opens sign-in.
 */
export function WantToPlayView({
  name,
  self,
  wantToPlay,
  memberPlayed,
  viewer,
  notify,
  openAuth,
}: {
  name: string;
  self: boolean;
  wantToPlay: readonly WantToPlayEntry[];
  memberPlayed: ReadonlySet<string>;
  viewer: ViewerCourses;
  notify: Notify;
  openAuth: () => void;
}) {
  const [logging, setLogging] = useState<Course | null>(null);
  const [history, setHistory] = useState<Course | null>(null);
  const [now] = useState(() => new Date());
  const wanted = new Set(viewer.wanted);

  const marks = (course: Course): PlayedMark[] => {
    const theyPlayed = memberPlayed.has(course.id);
    const openRounds = () => {
      setHistory(course);
    };
    if (self) return theyPlayed ? [{ label: "Played", you: false, onClick: openRounds }] : [];
    return [
      ...(theyPlayed ? [{ label: name, you: false }] : []),
      ...((viewer.played[course.id] ?? 0) > 0 ? [{ label: "You", you: true, onClick: openRounds }] : []),
    ];
  };

  return (
    <div className={profileStyles.columns}>
      <div>
        <section className={profileStyles.section} aria-labelledby="want-to-play">
          <h2 id="want-to-play" className={styles.sectionLabel}>
            Want to play <span>{wantToPlay.length}</span>
          </h2>
          {!wantToPlay.length ? (
            <div className={styles.emptyNote}>
              <strong>Nothing saved yet</strong>
              {self ? "Tap the bookmark on any course to save it here." : name + " hasn't saved any courses yet."}
            </div>
          ) : (
            <ol id="wantToPlay" className={topListStyles.list}>
              {wantToPlay.map((entry) => (
                <CourseRow
                  key={entry.course.id}
                  course={entry.course}
                  rank={null}
                  current={null}
                  played={false}
                  marks={marks(entry.course)}
                  note={"Added " + shortDate(localDate(new Date(entry.addedAt)), now)}
                  actions={
                    <CourseActions
                      course={entry.course}
                      wanted={wanted.has(entry.course.id)}
                      signedIn
                      onLog={setLogging}
                      notify={notify}
                      openAuth={openAuth}
                    />
                  }
                />
              ))}
            </ol>
          )}
        </section>
      </div>
      {history && (
        <RoundHistory
          key={history.id}
          course={history}
          notify={notify}
          onClose={() => {
            setHistory(null);
          }}
        />
      )}
      {logging && (
        <LogRoundDialog
          signedIn
          initial={logging}
          played={viewer.played}
          notify={notify}
          onSignIn={openAuth}
          onClose={() => {
            setLogging(null);
          }}
        />
      )}
    </div>
  );
}
