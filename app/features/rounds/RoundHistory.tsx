import { useEffect } from "react";
import { useFetcher } from "react-router";
import type { Course } from "../catalog/course";
import { Modal } from "../../shared/ui/Modal";
import { replyMessage, useJournalFetcher } from "../journal/use-journal-fetcher";

interface HistoryData {
  rounds?: { id: string; playedAt: string }[];
  error?: string;
}

/** Format a date-only value without shifting it across time zones. */
function formatPlayedAt(playedAt: string): string {
  return new Date(playedAt + "T00:00:00").toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Round history dialog: lists the caller's rounds for a course and deletes one at a time. */
export function RoundHistory({
  course,
  onClose,
  notify,
}: {
  course: Course;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const history = useFetcher<HistoryData>();
  const { busy, submit, fetcher } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
    if (reply.error) return;
    if (reply.removedCourse) onClose();
    else void history.load("/journal?courseId=" + course.id);
  });
  const load = history.load;

  useEffect(() => {
    void load("/journal?courseId=" + course.id);
  }, [course.id, load]);

  const rows = history.data?.rounds;
  const error = history.data?.error ?? "";
  const deleting = busy ? fetcher.formData?.get("roundId") : null;
  const remove = (id: string) => {
    if (busy || !window.confirm("Delete this round?")) return;
    submit({ intent: "delete-round", roundId: id });
  };

  return (
    <Modal
      id="roundmodal"
      title={course.name}
      eyebrow="Round history"
      onClose={onClose}
      dismissBackdrop
    >
      <div className="sub" id="roundModalSub">
        {error ||
          (!rows
            ? "Loading rounds…"
            : String(rows.length) +
              " logged round" +
              (rows.length === 1 ? "" : "s") +
              " for this course.")}
      </div>
      <div id="roundHistoryList" className="roundhistory-list">
        {rows?.length === 0 ? (
          <div className="empty">No rounds are logged in your account.</div>
        ) : (
          rows?.map((round) => (
            <div className="roundhistory-row" key={round.id}>
              <div className="roundhistory-date">
                <strong>{formatPlayedAt(round.playedAt)}</strong>
                <small>Logged in your account.</small>
              </div>
              <button
                className="delete-round"
                disabled={busy}
                onClick={() => {
                  remove(round.id);
                }}
              >
                {deleting === round.id ? "Deleting…" : "Delete"}
              </button>
            </div>
          ))
        )}
      </div>
      <div className="actions">
        <button className="secondary" id="roundDone" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
