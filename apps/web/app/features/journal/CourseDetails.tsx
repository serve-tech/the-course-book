import { useState } from "react";
import type { Course } from "@coursebook/domain/catalog/course";
import { Modal } from "../../shared/ui/Modal";
import { replyMessage, useJournalFetcher } from "./use-journal-fetcher";

/** Course options dialog: move to a rank, edit or view rounds, delete the course. */
export function CourseDetails({
  course,
  rank: currentRank,
  played,
  onClose,
  onHistory,
  onEditCount,
  notify,
}: {
  course: Course;
  rank: number;
  played: number;
  onClose: () => void;
  onHistory: () => void;
  onEditCount: () => void;
  notify: (message: string) => void;
}) {
  const [custom, setCustom] = useState(false),
    [rank, setRank] = useState(String(currentRank));
  const { busy, submit } = useJournalFetcher((reply) => {
    notify(replyMessage(reply));
    if (!reply.error) onClose();
  });
  const move = (value: number) => {
    if (busy) return;
    submit({ intent: "move", courseId: course.id, rank: String(value) });
  };
  const remove = () => {
    if (
      busy ||
      !window.confirm(
        "Delete " +
          course.name +
          " from My List? This permanently deletes " +
          String(played) +
          " logged round" +
          (played === 1 ? "" : "s") +
          " for this course.",
      )
    )
      return;
    submit({ intent: "delete-course", courseId: course.id });
  };
  return (
    <Modal
      id="rankmodal"
      title="Course Details"
      eyebrow="Course options"
      onClose={onClose}
      dismissBackdrop
    >
      <div className="rankmodal-course">
        <strong id="rankCourseName">{course.name}</strong>
        <span id="rankCourseLoc">{course.location}</span>
      </div>
      <div className="course-option-section">
        <div className="course-option-label">Personal ranking</div>
        {!custom ? (
          <div id="rankChoose">
            <div className="actions" style={{ marginTop: 0 }}>
              <button
                className="secondary"
                id="moveTop"
                disabled={busy}
                onClick={() => {
                  move(1);
                }}
              >
                Move to Top
              </button>
              <button
                className="primary"
                id="moveCustom"
                onClick={() => {
                  setCustom(true);
                }}
              >
                Move to…
              </button>
            </div>
          </div>
        ) : (
          <div id="rankCustom">
            <div className="group">
              <label htmlFor="rankInput">Move to rank</label>
              <input
                className="rankmoveinput"
                id="rankInput"
                autoFocus
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                placeholder="e.g. 5"
                value={rank}
                onChange={(event) => {
                  setRank(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") move(Number(rank));
                }}
              />
              <div className="rankmovehint">
                Enter any rank from 1 to the bottom. Other courses will shift
                automatically.
              </div>
            </div>
            <div className="actions">
              <button
                className="secondary"
                id="rankCancel"
                onClick={() => {
                  setCustom(false);
                }}
              >
                Cancel
              </button>
              <button
                className="primary"
                id="rankSave"
                disabled={busy}
                onClick={() => {
                  move(Number(rank));
                }}
              >
                {busy ? "Moving…" : "Move Course"}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="course-option-section">
        <div className="course-option-label">Rounds</div>
        <div className="course-option-buttons">
          <button className="secondary" id="editTimesPlayed" onClick={onEditCount}>
            Edit Times Played
          </button>
          <button className="secondary" id="viewDeleteRounds" onClick={onHistory}>
            View / Delete Rounds
          </button>
        </div>
      </div>
      <div className="course-option-section">
        <div className="course-option-label">Remove course</div>
        <button
          className="secondary danger-course"
          id="deleteCourse"
          disabled={busy}
          onClick={remove}
        >
          {busy ? "Working…" : "Delete Course"}
        </button>
        <div className="rankmovehint">
          Deletes all rounds for this course and removes it from your My List.
        </div>
      </div>
    </Modal>
  );
}
