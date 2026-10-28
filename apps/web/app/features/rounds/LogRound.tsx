import { useEffect, useState } from "react";
import type { Notify } from "../../shared/ui/shell";
import { api, unwrap } from "../../lib/api";
import { fromMyCourse } from "../../lib/api/mappers";
import { AddCourseDialog } from "./AddCourseDialog";
import { LogRoundDialog } from "./LogRoundDialog";

/**
 * Log a round over whatever page the member is on: course search, then the
 * hand-entered course dialog when search cannot find it. The layout opens
 * it for every general Log a round button and `?log=1` link, so logging
 * never moves the member to another page; the action's revalidation updates
 * the page underneath.
 *
 * The member's play counts, for the selected course's "Already played" note,
 * load when it opens. That note is optional, so a failed read is logged and
 * the dialog works without it.
 *
 * @param onClose - Closes the flow, after a log, a cancel or an added course.
 * @param onSignIn - Opens the account dialog if the session ended.
 */
export function LogRound({ onClose, onSignIn, notify }: { onClose: () => void; onSignIn: () => void; notify: Notify }) {
  const [adding, setAdding] = useState(false);
  const [played, setPlayed] = useState<Readonly<Record<string, number>>>({});

  useEffect(() => {
    const controller = new AbortController();
    api
      .GET("/v1/me/courses", { signal: controller.signal })
      .then(unwrap)
      .then(
        (mine) => {
          if (controller.signal.aborted) return;
          setPlayed(Object.fromEntries(mine.courses.map(fromMyCourse).map((row) => [row.course.id, row.played])));
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("Could not load play counts for the Log dialog", error);
        },
      );
    return () => {
      controller.abort();
    };
  }, []);

  if (adding) return <AddCourseDialog onClose={onClose} notify={notify} />;
  return (
    <LogRoundDialog
      signedIn
      played={played}
      onClose={onClose}
      onAdd={() => {
        setAdding(true);
      }}
      onSignIn={() => {
        onClose();
        onSignIn();
      }}
      notify={notify}
    />
  );
}
