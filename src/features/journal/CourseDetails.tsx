import { useState } from "react";
import { useJournal, useServices } from "../../app/context";
import type { Course } from "../catalog/course";
import { Modal } from "../../shared/ui/Modal";
import { errorMessage } from "../../shared/lib/errors";
export function CourseDetails({
  course,
  onClose,
  onHistory,
  onEditCount,
  notify,
}: {
  course: Course;
  onClose: () => void;
  onHistory: () => void;
  onEditCount: () => void;
  notify: (message: string) => void;
}) {
  const { journal, rounds } = useServices(),
    { account } = useJournal();
  const [custom, setCustom] = useState(false),
    [rank, setRank] = useState(String(account.myList.indexOf(course.id) + 1)),
    [deleting, setDeleting] = useState(false);
  const move = async (value: number) => {
    onClose();
    try {
      await journal.move(course.id, value);
      notify(
        "Moved to #" +
          String(journal.getSnapshot().account.myList.indexOf(course.id) + 1),
      );
    } catch (error) {
      console.warn(error);
      notify("Moved here; cloud update failed");
    }
  };
  const remove = async () => {
    const count = account.played[course.id] ?? 0;
    if (
      !window.confirm(
        "Delete " +
          course.name +
          " from My List? This permanently deletes " +
          String(count) +
          " logged round" +
          (count === 1 ? "" : "s") +
          " for this course.",
      )
    )
      return;
    setDeleting(true);
    try {
      await rounds.setCount(course, 0, true);
      onClose();
      notify("Course deleted from My List");
    } catch (error) {
      notify(errorMessage(error));
      setDeleting(false);
    }
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
                onClick={() => {
                  void move(1);
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
                  if (event.key === "Enter") void move(Number(rank));
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
                onClick={() => {
                  void move(Number(rank));
                }}
              >
                Move Course
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="course-option-section">
        <div className="course-option-label">Rounds</div>
        <div className="course-option-buttons">
          <button
            className="secondary"
            id="editTimesPlayed"
            onClick={onEditCount}
          >
            Edit Times Played
          </button>
          <button
            className="secondary"
            id="viewDeleteRounds"
            onClick={onHistory}
          >
            View / Delete Rounds
          </button>
        </div>
      </div>
      <div className="course-option-section">
        <div className="course-option-label">Remove course</div>
        <button
          className="secondary danger-course"
          id="deleteCourse"
          disabled={deleting}
          onClick={() => {
            void remove();
          }}
        >
          {deleting ? "Deleting…" : "Delete Course"}
        </button>
        <div className="rankmovehint">
          Deletes all rounds for this course and removes it from your My List.
        </div>
      </div>
    </Modal>
  );
}
