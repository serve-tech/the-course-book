import { useState } from "react";
import { Link } from "react-router";
import type { Course } from "@coursebook/domain/catalog/course";
import type { TopListProgress } from "@coursebook/domain/social/top-lists";
import type { WantToPlayEntry } from "@coursebook/domain/social/types";
import type { ViewerCourses } from "../../lib/api/viewer";
import { localDate } from "../../shared/lib/local-date";
import { LogRoundDialog } from "../rounds/LogRoundDialog";
import { CourseActions } from "../top-lists/CourseActions";
import { CourseRow, type PlayedMark } from "../top-lists/CourseRow";
import { topListSlug } from "../top-lists/lists";
import topListStyles from "../top-lists/top-lists.module.css";
import { ComingSoon } from "./ComingSoon";
import { shortDate } from "./format";
import { profilePath } from "./paths";
import profileStyles from "./profile.module.css";
import styles from "./social.module.css";

/**
 * The Lists tab: progress through the published Top lists, each opening
 * the list with the member's ticks; the member's Want to play list; and the
 * lists members make, which are still to come.
 *
 * @param progress - One row per list, in display order.
 * @param username - Whose tab it is.
 * @param name - Their display name.
 * @param self - Whether it is the viewer's own profile.
 * @param wantToPlay - Their Want to play list, newest first.
 * @param memberPlayed - Ids of the courses they played.
 * @param viewer - The viewer's courses and Want to play list, for the row buttons.
 */
export function TopListsView({
  progress,
  username,
  name,
  self,
  wantToPlay,
  memberPlayed,
  viewer,
  notify,
  openAuth,
}: {
  progress: readonly TopListProgress[];
  username: string;
  name: string;
  self: boolean;
  wantToPlay: readonly WantToPlayEntry[];
  memberPlayed: ReadonlySet<string>;
  viewer: ViewerCourses;
  notify: (message: string) => void;
  openAuth: () => void;
}) {
  const [logging, setLogging] = useState<Course | null>(null);
  const [now] = useState(() => new Date());
  const wanted = new Set(viewer.wanted);

  const marks = (courseId: string): PlayedMark[] => {
    const theyPlayed = memberPlayed.has(courseId);
    if (self) return theyPlayed ? [{ label: "Played", you: false }] : [];
    return [...(theyPlayed ? [{ label: name, you: false }] : []), ...((viewer.played[courseId] ?? 0) > 0 ? [{ label: "You", you: true }] : [])];
  };

  return (
    <div className={profileStyles.columns}>
      <div>
        <section className={profileStyles.section} aria-labelledby="top-lists">
          <h2 id="top-lists" className={styles.sectionLabel}>
            Top lists
          </h2>
          <div className={profileStyles.progressList}>
            {progress.map((list) => (
              <Link key={list.type + list.scope} className={profileStyles.progressRow} to={profilePath(username, "lists/" + topListSlug(list))}>
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
              </Link>
            ))}
          </div>
        </section>
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
                  marks={marks(entry.course.id)}
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
      <aside className={profileStyles.aside}>
        <ComingSoon title="Lists">
          {self ? "Make your own lists, ranked or not, like a Bandon trip or the best munis in Michigan." : "Lists " + name + " makes will appear here."}
        </ComingSoon>
      </aside>
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
