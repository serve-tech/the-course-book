import { useEffect, useState } from "react";
import type { Course } from "../catalog/course";
import type { Round } from "./round-repository";
import { useServices } from "../../app/context";
import { Modal } from "../../shared/ui/Modal";
import { errorMessage } from "../../shared/lib/errors";
export function RoundHistory({
  course,
  onClose,
  notify,
}: {
  course: Course;
  onClose: () => void;
  notify: (message: string) => void;
}) {
  const { rounds } = useServices();
  const [rows, setRows] = useState<Round[] | null>(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void rounds.history(course).then(
      (result) => {
        if (active) setRows(result);
      },
      (failure: unknown) => {
        if (active) setError(errorMessage(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [course, rounds]);
  const remove = async (id: string) => {
    if (deleting || !window.confirm("Delete this round?")) return;
    setDeleting(id);
    try {
      const last = await rounds.deleteRound(course, id);
      if (last) {
        onClose();
        notify("Round deleted; course removed from My List");
      } else {
        setRows(await rounds.history(course));
        notify("Round deleted");
      }
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setDeleting(null);
    }
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
                <strong>
                  {new Date(round.played_at ?? "").toLocaleString([], {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </strong>
                <small>Logged in your account.</small>
              </div>
              <button
                className="delete-round"
                disabled={!!deleting}
                onClick={() => {
                  void remove(round.id);
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
